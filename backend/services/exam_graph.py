"""
LangGraph workflow that prepares a JEE Main paper from the knowledge-base question bank.

    select_from_bank -> generate_missing -> assemble_paper

1. select_from_bank: per subject, 20 MCQ + 5 numerical questions the student hasn't seen,
   split between Easy / Medium / Hard by the student's adaptive level (services/difficulty.py)
   and spread across as many chapters as possible.
2. generate_missing: anything the bank can't supply is generated from the chapter PDFs at the
   missing difficulty (question_bank.generate_questions), preferring chapters not yet in the
   paper. If generation falls short, the gap is filled from unseen bank questions of the
   nearest other difficulty rather than failing the paper.
3. assemble_paper: an immutable snapshot of the questions is stored with the attempt, so
   answer keys never leave the server before submission. The 180-minute timer starts only
   now, not while the student watches the paper being prepared.

Preparation runs in a background thread; the attempt row reports progress
(prep_ready / prep_total) and the frontend polls it.
"""
import logging
import random
import threading
from datetime import timedelta
from typing import Dict, List, TypedDict

from langgraph.graph import END, StateGraph

from backend.lib.dates import utc_now
from backend.lib.db import SessionLocal
from backend.models.exam import ExamAnswer, ExamAttempt, ExamAttemptQuestion, ExamTemplate
from backend.models.practice import Question
from backend.services.difficulty import DIFFICULTIES, EASY, HARD, LEVEL_MIX, MEDIUM, exam_level, split_by_mix
from backend.services.question_bank import (
    MCQ,
    NUMERICAL,
    GenerationError,
    chapters_by_coverage,
    generate_questions,
    pick_spread,
    run_in_background,
    unseen_questions,
)

logger = logging.getLogger(__name__)

SUBJECT_ORDER = ("Physics", "Chemistry", "Mathematics")
# When a difficulty runs short, borrow from the closest one first.
FALLBACK_ORDER = {EASY: (MEDIUM, HARD), MEDIUM: (EASY, HARD), HARD: (MEDIUM, EASY)}


def paper_pattern(template: ExamTemplate) -> Dict[str, Dict[str, int]]:
    """{"Physics": {"mcq": 20, "numerical": 5}, ...}; older templates store a plain MCQ count."""
    pattern = {}
    for subject, spec in (template.subject_distribution or {}).items():
        pattern[subject] = spec if isinstance(spec, dict) else {MCQ: int(spec), NUMERICAL: 0}
    return pattern


class ExamPrepState(TypedDict):
    attempt_id: str
    user_id: str
    pattern: Dict[str, Dict[str, int]]
    mix: Dict[str, float]  # difficulty -> share of the paper
    picked: Dict[str, Dict[str, List[str]]]  # subject -> type -> question ids
    missing: Dict[str, Dict[str, Dict[str, int]]]  # subject -> type -> difficulty -> count
    seed: float


def _set_progress(attempt_id: str, ready: int) -> None:
    with SessionLocal() as db:
        attempt = db.get(ExamAttempt, attempt_id)
        if attempt and attempt.status == "preparing":
            attempt.prep_ready = ready
            db.commit()


def _ready_count(picked: Dict[str, Dict[str, List[str]]]) -> int:
    return sum(len(ids) for by_type in picked.values() for ids in by_type.values())


def select_from_bank(state: ExamPrepState) -> ExamPrepState:
    rng = random.Random(state["seed"])
    picked: Dict[str, Dict[str, List[str]]] = {}
    missing: Dict[str, Dict[str, Dict[str, int]]] = {}
    with SessionLocal() as db:
        for subject, counts in state["pattern"].items():
            picked[subject], missing[subject] = {}, {}
            for kind, count in counts.items():
                candidates = unseen_questions(db, state["user_id"], subject, kind)
                picked[subject][kind], missing[subject][kind] = [], {}
                for difficulty, quota in split_by_mix(count, state["mix"]).items():
                    pool = [q for q in candidates if q.difficulty == difficulty]
                    chosen = pick_spread(pool, quota, rng)
                    picked[subject][kind].extend(q.id for q in chosen)
                    missing[subject][kind][difficulty] = quota - len(chosen)
    _set_progress(state["attempt_id"], _ready_count(picked))
    return {**state, "picked": picked, "missing": missing}


def _fill_from_other_difficulties(state: ExamPrepState, subject: str, rng: random.Random) -> None:
    """Top up a subject's shortfall with unseen bank questions of the nearest difficulty."""
    picked = state["picked"][subject]
    with SessionLocal() as db:
        for kind, count in state["pattern"][subject].items():
            short = count - len(picked.get(kind, []))
            if short <= 0:
                continue
            taken = set(picked.get(kind, []))
            spare = [q for q in unseen_questions(db, state["user_id"], subject, kind) if q.id not in taken]
            by_difficulty = {d: [q for q in spare if q.difficulty == d] for d in DIFFICULTIES}
            # Borrow on behalf of the difficulties that ran short, nearest difficulty first.
            for wanted, n in state["missing"][subject][kind].items():
                for other in FALLBACK_ORDER[wanted]:
                    if n <= 0 or short <= 0:
                        break
                    chosen = pick_spread(by_difficulty[other], min(n, short), rng)
                    for q in chosen:
                        by_difficulty[other].remove(q)
                    picked.setdefault(kind, []).extend(q.id for q in chosen)
                    n -= len(chosen)
                    short -= len(chosen)


def generate_missing(state: ExamPrepState) -> ExamPrepState:
    rng = random.Random(state["seed"])
    picked = state["picked"]
    generation_error = None
    for subject, counts in state["pattern"].items():
        for difficulty in DIFFICULTIES:
            need = {kind: max(0, state["missing"][subject][kind].get(difficulty, 0)) for kind in counts}
            if not any(need.values()) or generation_error:
                continue
            with SessionLocal() as db:
                already = db.query(Question).filter(
                    Question.id.in_([qid for ids in picked[subject].values() for qid in ids])
                ).all()
            base = _ready_count(picked)
            try:
                made = generate_questions(
                    subject,
                    need.get(MCQ, 0),
                    need.get(NUMERICAL, 0),
                    chapter_order=chapters_by_coverage(subject, already, rng),
                    on_progress=lambda n, base=base: _set_progress(state["attempt_id"], base + n),
                    rng=rng,
                    difficulty=difficulty,
                )
            except GenerationError as exc:
                # Out of model quota: still try to build the paper from what the bank has.
                generation_error = exc
                continue
            for kind, ids in made.items():
                picked[subject].setdefault(kind, []).extend(ids)
                state["missing"][subject][kind][difficulty] -= len(ids)
        _fill_from_other_difficulties(state, subject, rng)
    _set_progress(state["attempt_id"], _ready_count(picked))
    if generation_error and _ready_count(picked) < sum(sum(c.values()) for c in state["pattern"].values()):
        raise generation_error
    return {**state, "picked": picked}


def assemble_paper(state: ExamPrepState) -> ExamPrepState:
    pattern, picked = state["pattern"], state["picked"]
    expected = sum(sum(c.values()) for c in pattern.values())
    ready = _ready_count(picked)
    if ready < expected:
        raise GenerationError(
            f"Only {ready} of {expected} questions could be prepared (some generated questions "
            "failed the answer check). Please try again."
        )

    with SessionLocal() as db:
        attempt = db.get(ExamAttempt, state["attempt_id"])
        if not attempt or attempt.status != "preparing":
            return state
        template = db.get(ExamTemplate, attempt.template_id)
        questions = {q.id: q for q in db.query(Question).filter(
            Question.id.in_([qid for by_type in picked.values() for ids in by_type.values() for qid in ids])
        )}

        order = [s for s in SUBJECT_ORDER if s in pattern] + [s for s in pattern if s not in SUBJECT_ORDER]
        index = 0
        for subject in order:
            # Section layout as on the NTA paper: MCQs first, then numerical questions.
            for kind in (MCQ, NUMERICAL):
                for qid in picked[subject].get(kind, []):
                    q = questions[qid]
                    index += 1
                    snapshot = ExamAttemptQuestion(
                        attempt_id=attempt.id,
                        source_question_id=q.id,
                        order_index=index,
                        subject=q.subject,
                        topic=q.topic,
                        difficulty=q.difficulty,
                        question_text=q.question_text,
                        options=q.options,
                        correct_answer=q.correct_answer,
                        explanation=q.explanation,
                        marks=template.default_marks,
                        negative_marks=template.default_negative_marks,
                        question_type=q.question_type,
                        source_ref=q.source_ref,
                    )
                    db.add(snapshot)
                    db.flush()
                    db.add(ExamAnswer(attempt_id=attempt.id, attempt_question_id=snapshot.id))

        now = utc_now()
        attempt.started_at = now
        attempt.expires_at = now + timedelta(minutes=attempt.duration_minutes)
        attempt.max_score = index * template.default_marks
        attempt.prep_ready = index
        attempt.status = "in_progress"
        db.commit()
    return state


def build_exam_prep_graph():
    workflow = StateGraph(ExamPrepState)
    workflow.add_node("select_from_bank", select_from_bank)
    workflow.add_node("generate_missing", generate_missing)
    workflow.add_node("assemble_paper", assemble_paper)
    workflow.set_entry_point("select_from_bank")
    workflow.add_edge("select_from_bank", "generate_missing")
    workflow.add_edge("generate_missing", "assemble_paper")
    workflow.add_edge("assemble_paper", END)
    return workflow.compile()


_preparing: set = set()
_preparing_lock = threading.Lock()


def _prepare(attempt_id: str) -> None:
    try:
        with SessionLocal() as db:
            attempt = db.get(ExamAttempt, attempt_id)
            if not attempt or attempt.status != "preparing":
                return
            template = db.get(ExamTemplate, attempt.template_id)
            state: ExamPrepState = {
                "attempt_id": attempt.id,
                "user_id": attempt.user_id,
                "pattern": paper_pattern(template),
                "mix": LEVEL_MIX[attempt.difficulty_level],
                "picked": {},
                "missing": {},
                "seed": random.random(),
            }
        build_exam_prep_graph().invoke(state)
    except Exception as exc:
        logger.exception("Exam preparation failed for %s", attempt_id)
        message = str(exc) if isinstance(exc, GenerationError) else "Something went wrong while preparing the paper. Please try again."
        with SessionLocal() as db:
            attempt = db.get(ExamAttempt, attempt_id)
            if attempt and attempt.status == "preparing":
                attempt.status = "failed"
                attempt.prep_error = message
                db.commit()
    finally:
        with _preparing_lock:
            _preparing.discard(attempt_id)


def is_preparing(attempt_id: str) -> bool:
    with _preparing_lock:
        return attempt_id in _preparing


def start_preparation(attempt_id: str) -> None:
    """Start (or, after a server restart, resume) preparing a paper in the background."""
    with _preparing_lock:
        if attempt_id in _preparing:
            return
        _preparing.add(attempt_id)
    run_in_background(_prepare, attempt_id)


def create_exam_attempt(db, user_id: str, template: ExamTemplate) -> ExamAttempt:
    pattern = paper_pattern(template)
    now = utc_now()
    attempt = ExamAttempt(
        user_id=user_id,
        template_id=template.id,
        exam_type=template.exam_type,
        title=template.name,
        status="preparing",
        difficulty_level=exam_level(db, user_id),
        duration_minutes=template.duration_minutes,
        started_at=now,
        expires_at=now + timedelta(minutes=template.duration_minutes),  # reset when the paper is ready
        prep_total=sum(sum(c.values()) for c in pattern.values()),
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    start_preparation(attempt.id)
    return attempt
