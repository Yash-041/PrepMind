"""
Question bank generated from the knowledge base (NCERT chapters).

Pipeline for one batch:
  1. sample a ~3,000-character passage from a chapter PDF (kb_sources)
  2. QUESTION_GEN_MODEL writes JEE Main MCQs / numerical questions on that passage
  3. structural checks (4 distinct options, numeric answers, self-contained wording)
  4. QUESTION_CHECK_MODEL solves the questions without seeing the key; a question is
     kept only if its answer matches
  5. de-duplicated by a hash of the normalised text and stored in `questions`

Questions are shared by all users; exams and Daily 20 only pick questions the user
hasn't seen yet. Pre-build the bank so exams start instantly:

    python -m backend.services.question_bank --exams 2
"""
import argparse
import hashlib
import json
import logging
import math
import random
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.lib.config import settings
from backend.lib.db import SessionLocal
from backend.models.exam import ExamAttempt, ExamAttemptQuestion
from backend.models.practice import DailyPracticeQuestion, DailyPracticeSet, Question
from backend.models.progress import UserTopicProgress
from backend.services.question_text import repair_latex, text_problems
from backend.services.kb_sources import SUBJECTS, Chapter, chapter_passages, chapters_for, find_chapter, sample_passage

logger = logging.getLogger(__name__)

MCQ, NUMERICAL = "mcq", "numerical"
MAX_PER_CALL = 3          # questions per passage; fewer means more chapters per paper
PARALLEL_CALLS = 3        # concurrent generation batches (Groq retries on 429)
WEAK_TOPIC_TARGET = 4     # unseen questions to keep ready per weak chapter
WEAK_TOPIC_LIMIT = 6      # weak chapters topped up after each test

GENERATOR_PROMPT = r"""You write questions for the JEE Main exam from NCERT textbook passages.
Return JSON only, in this shape:
{"questions": [
  {"type": "mcq", "question": "...", "options": ["...", "...", "...", "..."], "answer_index": 0,
   "explanation": "...", "difficulty": "Easy|Medium|Hard", "concept": "..."},
  {"type": "numerical", "question": "...", "answer": 12, "explanation": "...",
   "difficulty": "Easy|Medium|Hard", "concept": "..."}
]}
Rules:
- Test a concept, law, formula or reaction from the passage at JEE Main level: application,
  calculation or reasoning, not trivia about the book (no page numbers, examples, figure labels).
- Every question is self-contained: give all data needed and never mention "the passage",
  "the text", "the given chapter" or "the above". Questions are shown one at a time in
  random order, so never refer to another question ("for the same problem", "in the
  previous question"); repeat the needed data instead.
- MCQ: exactly one correct option; the other three are plausible mistakes. answer_index is 0-3.
  Never use "All of the above" or "None of these".
- Numerical: the answer is a single number, preferably an integer. Say in the question which
  unit to use and how to round, e.g. "(in kJ, nearest integer)".
- Write maths in LaTeX with $...$, chemistry with $\ce{...}$, units upright, e.g. $\mathrm{m\,s^{-1}}$.
  Every LaTeX command, including \ce{...}, \text{...} and \mathrm{...}, must be inside $...$.
  Write money as plain text with the ₹ sign (₹250); there is no \Rs command.
- Questions and options use inline $...$ maths only: never $$...$$ or tables. Each option
  is a single line.
- explanation: a short worked solution that ends with the answer.
- concept: 2-6 words naming the idea tested, e.g. "Henry's law".
- Each question tests a different idea from the passage. Unless a difficulty is requested,
  aim for real JEE Main difficulty: mostly Medium, some Hard, few Easy; prefer two-step
  reasoning over one-line substitution.
- Difficulty levels: Easy = one concept, one or two steps (direct use of a formula or fact).
  Medium = typical JEE Main: two or three steps, or combining two ideas. Hard = the toughest
  JEE Main questions: several concepts, longer calculation, or a non-obvious insight.
- Check that the data you give is consistent and that your answer is correct."""

CHECKER_PROMPT = """Solve each JEE question independently and carefully. Return JSON only:
{"answers": [{"id": 1, "answer": "B"}, {"id": 2, "answer": 42}]}
For a multiple-choice question answer with the option letter. For a numerical question answer
with the number only, rounded exactly as the question asks."""


class GenerationError(RuntimeError):
    """The question model is unavailable or out of quota; the message is shown to the user."""


# ---------------------------------------------------------------------------
# Model calls
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _groq_client():
    from groq import Groq

    # The SDK waits for Groq's retry-after on 429 (tokens-per-minute limit) and retries.
    return Groq(api_key=settings.GROQ_API_KEY, max_retries=8, timeout=120)


def _complete_json(model_id: str, system: str, user: str, reasoning: str = "medium") -> dict:
    provider, _, name = model_id.partition(":")
    if provider == "groq":
        if not settings.GROQ_API_KEY:
            raise GenerationError("GROQ_API_KEY is not set, so questions can't be generated.")
        from groq import APIStatusError, RateLimitError

        kwargs = {"reasoning_effort": reasoning} if "gpt-oss" in name else {}
        try:
            response = _groq_client().chat.completions.create(
                model=name,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                response_format={"type": "json_object"},
                temperature=0.6,
                max_completion_tokens=8000,
                **kwargs,
            )
        except RateLimitError as exc:
            if "per day" in str(exc).lower() or "tpd" in str(exc).lower():
                raise GenerationError(
                    "The question model has used today's free Groq quota. Try again tomorrow, "
                    "or use the questions already in the bank."
                ) from exc
            raise
        except APIStatusError as exc:
            raise GenerationError(f"The question model returned an error ({exc.status_code}).") from exc
        return json.loads(response.choices[0].message.content or "{}")

    from backend.services.llm import content_text, get_chat_model, model_available

    if not model_available(model_id):
        raise GenerationError(f"No API key is configured for {model_id}.")
    reply = content_text(get_chat_model(model_id, temperature=0.6).invoke(
        [("system", system), ("human", user)]
    ).content)
    match = re.search(r"\{.*\}", reply, re.DOTALL)
    return json.loads(match.group(0)) if match else {}


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

_LEAKY = re.compile(r"\b(the|this|above|given) (passage|text|excerpt|chapter)\b|\bas stated above\b", re.IGNORECASE)
_BANNED_OPTIONS = re.compile(r"^(all|none) of (the )?(above|these)", re.IGNORECASE)


def content_hash(text: str) -> str:
    normalised = re.sub(r"[^a-z0-9]+", "", text.lower())
    return hashlib.sha256(normalised.encode()).hexdigest()


def format_number(value: float) -> str:
    """12.0 -> "12", 0.5 -> "0.5"; numerical answers are stored as plain strings."""
    return str(int(round(value))) if abs(value - round(value)) < 1e-9 else f"{value:.4g}"


def parse_number(text) -> Optional[float]:
    if isinstance(text, bool) or text is None:
        return None
    if isinstance(text, (int, float)):
        value = float(text)
    else:
        cleaned = str(text).strip().replace(",", "").replace("−", "-")
        if not re.fullmatch(r"[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?", cleaned):
            return None
        value = float(cleaned)
    return value if math.isfinite(value) else None


def numbers_match(given, expected) -> bool:
    a, b = parse_number(given), parse_number(expected)
    if a is None or b is None:
        return False
    return abs(a - b) <= max(0.01, abs(b) * 1e-3)


def _math(text) -> str:
    """Use the $ / $$ delimiters the frontend renders and repair LaTeX it can't show."""
    from backend.services.llm import content_text

    return repair_latex(content_text(str(text)))


def _clean_draft(raw: dict) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None
    kind = str(raw.get("type", "")).lower()
    question = _math(raw.get("question", ""))
    explanation = _math(raw.get("explanation", ""))
    if kind not in (MCQ, NUMERICAL) or len(question) < 25 or not explanation or _LEAKY.search(question):
        return None
    # Still unrenderable after repair, or depends on another question ("for the same problem").
    if text_problems(question):
        return None
    difficulty = str(raw.get("difficulty", "Medium")).title()
    draft = {
        "type": kind,
        "question": question,
        "explanation": explanation,
        "difficulty": difficulty if difficulty in ("Easy", "Medium", "Hard") else "Medium",
        "concept": str(raw.get("concept", "")).strip()[:160] or None,
    }
    if kind == MCQ:
        options = raw.get("options")
        index = raw.get("answer_index")
        if not isinstance(options, list) or len(options) != 4 or not isinstance(index, int) or not 0 <= index <= 3:
            return None
        options = [_math(o) for o in options]
        if any(not o or _BANNED_OPTIONS.match(o) or text_problems(o, standalone=False) for o in options) \
                or len({o.lower() for o in options}) != 4:
            return None
        draft["options"] = options
        draft["answer"] = options[index]
    else:
        value = parse_number(raw.get("answer"))
        if value is None:
            return None
        draft["options"] = []
        draft["answer"] = format_number(value)
    return draft


def _independent_check(drafts: List[dict]) -> List[bool]:
    """Ask a second model to solve the drafts; True where it reaches the same answer."""
    lines = []
    for i, d in enumerate(drafts, start=1):
        if d["type"] == MCQ:
            opts = "\n".join(f"  {chr(65 + j)}. {o}" for j, o in enumerate(d["options"]))
            lines.append(f"Question {i} (multiple choice):\n{d['question']}\n{opts}")
        else:
            lines.append(f"Question {i} (numerical):\n{d['question']}")
    try:
        reply = _complete_json(settings.QUESTION_CHECK_MODEL, CHECKER_PROMPT, "\n\n".join(lines), reasoning="medium")
    except GenerationError:
        raise
    except Exception as exc:
        logger.warning("Answer check failed, dropping batch: %s", exc)
        return [False] * len(drafts)

    given = {}
    for item in reply.get("answers", []) if isinstance(reply, dict) else []:
        if isinstance(item, dict) and str(item.get("id", "")).isdigit():
            given[int(item["id"])] = item.get("answer")
    verdicts = []
    for i, d in enumerate(drafts, start=1):
        answer = given.get(i)
        if d["type"] == MCQ:
            letter = str(answer or "").strip().upper()[:1]
            verdicts.append(letter in "ABCD" and letter != "" and d["options"][ord(letter) - 65] == d["answer"])
        else:
            verdicts.append(numbers_match(answer, d["answer"]))
    return verdicts


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------

def generate_batch(
    chapter: Chapter, n_mcq: int, n_numerical: int, rng: random.Random, difficulty: Optional[str] = None
) -> List[str]:
    """Generate, check and store up to n_mcq + n_numerical questions; returns new question ids."""
    passage, page = sample_passage(chapter, rng)
    asks = []
    if n_mcq:
        asks.append(f"{n_mcq} mcq")
    if n_numerical:
        asks.append(f"{n_numerical} numerical")
    user = (
        f"Subject: {chapter.subject}. Chapter: {chapter.title} ({chapter.student_class}).\n"
        f"Write {' and '.join(asks)} question{'s' if n_mcq + n_numerical > 1 else ''}"
        f"{f', all of {difficulty} difficulty' if difficulty else ''}.\n\n"
        f"Passage:\n{passage}"
    )
    reply = _complete_json(settings.QUESTION_GEN_MODEL, GENERATOR_PROMPT, user)
    raw_items = reply.get("questions", []) if isinstance(reply, dict) else []
    # Keep only what was asked for, per type.
    wanted = {MCQ: n_mcq, NUMERICAL: n_numerical}
    drafts = []
    for draft in filter(None, map(_clean_draft, raw_items)):
        if wanted[draft["type"]] > 0:
            wanted[draft["type"]] -= 1
            drafts.append(draft)
    if not drafts:
        return []

    verdicts = _independent_check(drafts)
    stored: List[str] = []
    with SessionLocal() as db:
        for draft, ok in zip(drafts, verdicts):
            if not ok:
                continue
            q = Question(
                subject=chapter.subject,
                topic=chapter.title,
                exam_type="JEE Main",
                # A requested difficulty wins over the model's own label, so quotas stay exact.
                difficulty=difficulty or draft["difficulty"],
                question_text=draft["question"],
                options=draft["options"],
                correct_answer=draft["answer"],
                explanation=draft["explanation"],
                marks=4.0,
                negative_marks=1.0,
                is_generated=True,
                math_verified=True,
                question_type=draft["type"],
                source="kb",
                source_ref=f"{chapter.source_label}, p. {page}",
                concept=draft["concept"],
                generated_by=settings.QUESTION_GEN_MODEL,
                content_hash=content_hash(draft["question"]),
            )
            try:
                with db.begin_nested():
                    db.add(q)
            except IntegrityError:
                continue  # an identical question is already in the bank
            stored.append(q.id)
        db.commit()
    return stored


def generate_questions(
    subject: str,
    n_mcq: int,
    n_numerical: int,
    chapter_order: Optional[Sequence[Chapter]] = None,
    on_progress: Optional[Callable[[int], None]] = None,
    rng: Optional[random.Random] = None,
    difficulty: Optional[str] = None,
) -> Dict[str, List[str]]:
    """
    Generate n_mcq + n_numerical new questions for a subject, spread across chapters,
    all at `difficulty` ("Easy" / "Medium" / "Hard") when one is given.
    Returns {"mcq": [ids], "numerical": [ids]}; may return fewer if the model keeps failing.
    """
    rng = rng or random.Random()
    chapters = list(chapter_order or chapters_for(subject))
    if not chapter_order:
        rng.shuffle(chapters)
    chapters = [c for c in chapters if chapter_passages(c)]
    if not chapters:
        raise GenerationError(f"No readable {subject} chapter PDFs found in the knowledge base.")

    made: Dict[str, List[str]] = {MCQ: [], NUMERICAL: []}
    need = {MCQ: n_mcq, NUMERICAL: n_numerical}
    pending = {MCQ: 0, NUMERICAL: 0}  # asked for in batches still running
    lock = threading.Lock()
    next_chapter = 0
    calls_left = 3 * math.ceil((n_mcq + n_numerical) / 2) + 4  # cap on retries for dropped questions

    def plan_batch() -> Optional[Tuple[Chapter, int, int]]:
        nonlocal next_chapter, calls_left
        missing = {k: need[k] - len(made[k]) - pending[k] for k in need}
        if calls_left <= 0 or (missing[MCQ] <= 0 and missing[NUMERICAL] <= 0):
            return None
        calls_left -= 1
        chapter = chapters[next_chapter % len(chapters)]
        next_chapter += 1
        n_num = min(max(missing[NUMERICAL], 0), 2)
        n_mcq_batch = min(max(missing[MCQ], 0), MAX_PER_CALL - n_num)
        pending[MCQ] += n_mcq_batch
        pending[NUMERICAL] += n_num
        return chapter, n_mcq_batch, n_num

    with ThreadPoolExecutor(max_workers=PARALLEL_CALLS) as pool:
        futures = {}

        def submit_next() -> None:
            with lock:
                batch = plan_batch()
            if batch:
                futures[pool.submit(generate_batch, batch[0], batch[1], batch[2], random.Random(rng.random()), difficulty)] = batch

        for _ in range(PARALLEL_CALLS):
            submit_next()
        while futures:
            future = next(as_completed(futures))
            _, asked_mcq, asked_num = futures.pop(future)
            try:
                new_ids = future.result()
            except GenerationError:
                for f in futures:
                    f.cancel()
                raise
            except Exception as exc:  # malformed JSON, timeouts: try another passage
                logger.warning("Question batch failed: %s", exc)
                new_ids = []
            with lock:
                pending[MCQ] -= asked_mcq
                pending[NUMERICAL] -= asked_num
                if new_ids:
                    with SessionLocal() as db:
                        rows = db.query(Question.id, Question.question_type).filter(Question.id.in_(new_ids)).all()
                    for qid, kind in rows:
                        if len(made[kind]) < need[kind]:
                            made[kind].append(qid)
                if on_progress:
                    on_progress(len(made[MCQ]) + len(made[NUMERICAL]))
            submit_next()
    return made


# ---------------------------------------------------------------------------
# Selection
# ---------------------------------------------------------------------------

def seen_question_ids(db: Session, user_id: str) -> Set[str]:
    """Bank questions the user already met in an exam or a Daily 20 set."""
    in_exams = (
        db.query(ExamAttemptQuestion.source_question_id)
        .join(ExamAttempt, ExamAttempt.id == ExamAttemptQuestion.attempt_id)
        .filter(ExamAttempt.user_id == user_id, ExamAttemptQuestion.source_question_id.isnot(None))
    )
    in_daily = (
        db.query(DailyPracticeQuestion.question_id)
        .join(DailyPracticeSet, DailyPracticeSet.id == DailyPracticeQuestion.set_id)
        .filter(DailyPracticeSet.user_id == user_id)
    )
    return {row[0] for row in in_exams.union(in_daily).all()}


def unseen_questions(
    db: Session, user_id: str, subject: str, kind: str, topics: Optional[Iterable[str]] = None
) -> List[Question]:
    seen = seen_question_ids(db, user_id)
    query = db.query(Question).filter(
        Question.source == "kb", Question.subject == subject, Question.question_type == kind
    )
    if topics is not None:
        query = query.filter(Question.topic.in_(list(topics)))
    return [q for q in query.all() if q.id not in seen]


def pick_spread(candidates: List[Question], count: int, rng: random.Random) -> List[Question]:
    """Pick `count` questions covering as many chapters as possible."""
    by_topic: Dict[str, List[Question]] = {}
    for q in candidates:
        by_topic.setdefault(q.topic, []).append(q)
    topics = list(by_topic)
    rng.shuffle(topics)
    for bucket in by_topic.values():
        rng.shuffle(bucket)
    chosen: List[Question] = []
    while len(chosen) < count and any(by_topic.values()):
        for topic in topics:
            if by_topic[topic] and len(chosen) < count:
                chosen.append(by_topic[topic].pop())
    return chosen


def chapters_by_coverage(subject: str, picked: List[Question], rng: random.Random) -> List[Chapter]:
    """Chapters with no question in the paper yet come first, so new questions widen coverage."""
    counts: Dict[str, int] = {}
    for q in picked:
        counts[q.topic] = counts.get(q.topic, 0) + 1
    chapters = chapters_for(subject)
    rng.shuffle(chapters)
    return sorted(chapters, key=lambda c: counts.get(c.title, 0))


# ---------------------------------------------------------------------------
# Weak topics -> Daily 20
# ---------------------------------------------------------------------------

def top_up_weak_topics(user_id: str) -> int:
    """Make sure the user's weakest chapters have unseen questions ready for Daily 20."""
    created = 0
    with SessionLocal() as db:
        weak = (
            db.query(UserTopicProgress)
            .filter(UserTopicProgress.user_id == user_id, UserTopicProgress.weak_severity.in_(["high", "medium", "low"]))
            .order_by(UserTopicProgress.accuracy.asc(), UserTopicProgress.last_attempted_at.desc())
            .limit(WEAK_TOPIC_LIMIT)
            .all()
        )
        plan = []
        for row in weak:
            chapter = find_chapter(row.subject, row.topic)
            if not chapter:
                continue
            ready = len(unseen_questions(db, user_id, row.subject, MCQ, [row.topic]))
            if ready < WEAK_TOPIC_TARGET:
                plan.append((chapter, WEAK_TOPIC_TARGET - ready))
    for chapter, missing in plan:
        # Weak chapters are practised with Easy/Medium questions first (services/difficulty.py).
        easy = (missing + 1) // 2
        try:
            for difficulty, n in (("Easy", easy), ("Medium", missing - easy)):
                if n:
                    created += len(generate_questions(chapter.subject, n, 0, chapter_order=[chapter], difficulty=difficulty)[MCQ])
        except GenerationError as exc:
            logger.warning("Weak-topic top-up stopped: %s", exc)
            break
    return created


def run_in_background(fn: Callable, *args) -> None:
    def runner() -> None:
        try:
            fn(*args)
        except Exception:
            logger.exception("Background task %s failed", getattr(fn, "__name__", fn))

    threading.Thread(target=runner, daemon=True).start()


# ---------------------------------------------------------------------------
# CLI: pre-build the bank
# ---------------------------------------------------------------------------

def build_bank(exams: int, subjects: Sequence[str]) -> None:
    from backend.lib.db import init_db

    init_db()
    for subject in subjects:
        with SessionLocal() as db:
            have = dict(
                db.query(Question.question_type, func.count(Question.id))
                .filter(Question.source == "kb", Question.subject == subject)
                .group_by(Question.question_type)
                .all()
            )
        need_mcq = max(0, 20 * exams - have.get(MCQ, 0))
        need_num = max(0, 5 * exams - have.get(NUMERICAL, 0))
        print(f"{subject}: bank has {have.get(MCQ, 0)} MCQ / {have.get(NUMERICAL, 0)} numerical; "
              f"generating {need_mcq} MCQ + {need_num} numerical", flush=True)
        if not need_mcq and not need_num:
            continue
        total = need_mcq + need_num
        made = generate_questions(
            subject, need_mcq, need_num,
            on_progress=lambda n, total=total: print(f"  {n}/{total}", flush=True),
        )
        print(f"  added {len(made[MCQ])} MCQ + {len(made[NUMERICAL])} numerical", flush=True)


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    parser = argparse.ArgumentParser(description="Pre-generate exam questions from the knowledge base.")
    parser.add_argument("--exams", type=int, default=1, help="Full JEE Main papers' worth of questions to keep in the bank.")
    parser.add_argument("--subject", choices=SUBJECTS, help="Only this subject.")
    args = parser.parse_args()
    try:
        build_bank(args.exams, [args.subject] if args.subject else SUBJECTS)
    except GenerationError as exc:
        print(f"Stopped: {exc}")
