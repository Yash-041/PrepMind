"""
Daily 20 practice set generation.
Builds one set per (user, local calendar date, target exam):

1. Priority: up to 14 questions from the student's weak chapters (high severity first,
   at most 4 per chapter), Easy/Medium first to rebuild the basics. Weak chapters come from exam and Daily 20 results
   (progress_tracker); after each test the bank is topped up for them
   (question_bank.top_up_weak_topics), so questions are usually ready.
2. The rest (at least 6) round-robin across Physics, Chemistry and Mathematics as revision,
   Medium/Hard first so strong chapters keep being stretched.

Questions come from the knowledge-base bank and skip anything the student has already
seen; the small seed bank and repeats are only used if the bank runs dry.
"""
import random
from typing import List
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.lib.dates import local_today
from backend.models.practice import Question, DailyPracticeSet, DailyPracticeQuestion
from backend.models.progress import UserTopicProgress
from backend.services.difficulty import REVISION_PREFERENCE, WEAK_TOPIC_PREFERENCE, order_by_preference
from backend.services.question_bank import MCQ, seen_question_ids

DAILY_SET_SIZE = 20
WEAK_SHARE = 14
PER_WEAK_TOPIC = 4
SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}


SUBJECTS = ("Physics", "Chemistry", "Mathematics")


def _select_questions(db: Session, user_id: str, target_exam: str) -> List[Question]:
    rng = random.Random()
    already_seen = seen_question_ids(db, user_id)
    # Daily 20 is single-correct MCQs; numerical questions are practised in the exam.
    mcqs = db.query(Question).filter(Question.question_type == MCQ).all()
    rng.shuffle(mcqs)
    fresh_kb = [q for q in mcqs if q.source == "kb" and q.id not in already_seen]

    weak_rows = sorted(
        db.query(UserTopicProgress)
        .filter(
            UserTopicProgress.user_id == user_id,
            UserTopicProgress.weak_severity.in_(list(SEVERITY_ORDER)),
        )
        .all(),
        key=lambda r: (SEVERITY_ORDER[r.weak_severity], r.accuracy),
    )

    chosen: List[Question] = []
    taken: set = set()
    for row in weak_rows:
        if len(chosen) >= WEAK_SHARE:
            break
        matches = order_by_preference(
            [q for q in fresh_kb if q.subject == row.subject and q.topic == row.topic], WEAK_TOPIC_PREFERENCE
        )
        for q in matches[:min(PER_WEAK_TOPIC, WEAK_SHARE - len(chosen))]:
            chosen.append(q)
            taken.add(q.id)

    # The rest is shared equally between the subjects. Each subject is filled from fresh
    # bank questions, then the seed bank, and only then repeats.
    def candidates(subject: str) -> List[Question]:
        fresh = order_by_preference([q for q in fresh_kb if q.subject == subject], REVISION_PREFERENCE)
        seed = [q for q in mcqs if q.subject == subject and q.source == "seed" and q.id not in already_seen]
        # source "retired": withdrawn questions, kept only for students' history.
        repeats = [q for q in mcqs if q.subject == subject and q.id in already_seen and q.source != "retired"]
        return fresh + seed + repeats

    queues = {subject: candidates(subject) for subject in SUBJECTS}
    while len(chosen) < DAILY_SET_SIZE and any(queues.values()):
        for subject in SUBJECTS:
            queue = queues[subject]
            while queue and queue[0].id in taken:
                queue.pop(0)
            if queue and len(chosen) < DAILY_SET_SIZE:
                q = queue.pop(0)
                chosen.append(q)
                taken.add(q.id)
    return chosen


def get_or_create_daily_set(
    db: Session, user_id: str, target_exam: str
) -> DailyPracticeSet:
    today = local_today()
    existing = (
        db.query(DailyPracticeSet)
        .filter(
            DailyPracticeSet.user_id == user_id,
            DailyPracticeSet.set_date == today,
            DailyPracticeSet.target_exam == target_exam,
        )
        .first()
    )
    if existing:
        return existing

    pset = DailyPracticeSet(user_id=user_id, set_date=today, target_exam=target_exam)
    db.add(pset)
    db.flush()
    for idx, q in enumerate(_select_questions(db, user_id, target_exam), start=1):
        db.add(DailyPracticeQuestion(set_id=pset.id, question_id=q.id, order_index=idx))
    try:
        db.commit()
    except IntegrityError:
        # A concurrent request created today's set first; return that one.
        db.rollback()
        return get_or_create_daily_set(db, user_id, target_exam)
    db.refresh(pset)
    return pset
