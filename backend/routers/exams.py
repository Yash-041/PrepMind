from datetime import timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.lib.db import get_db
from backend.lib.dates import utc_now
from backend.lib.security import get_current_user
from backend.models.user import User
from backend.models.exam import (
    ExamTemplate,
    ExamAttempt,
    ExamAttemptQuestion,
)
from backend.models.progress import UserTopicProgress
from backend.schemas.api_schemas import (
    ExamStartRequest,
    ExamAnswersBulkUpdateRequest,
)
from backend.services.difficulty import DIFFICULTIES, LEVEL_MIX, exam_level, level_summary, split_by_mix
from backend.services.exam_graph import create_exam_attempt, is_preparing, paper_pattern, start_preparation
from backend.services.progress_tracker import record_topic_outcome
from backend.services.question_bank import (
    NUMERICAL,
    numbers_match,
    run_in_background,
    top_up_weak_topics,
    unseen_questions,
)

router = APIRouter(prefix="/api/exams", tags=["Exam Simulator"])

DEFAULT_TEMPLATE = "JEE_MAIN_FULL"
# Rough generation speed on Groq's free tier, for the "will take ~N min" hint.
QUESTIONS_PER_MINUTE = 10


def _ensure_utc(dt):
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _owned_attempt(db: Session, attempt_id: str, user: User) -> ExamAttempt:
    attempt = (
        db.query(ExamAttempt)
        .filter(ExamAttempt.id == attempt_id, ExamAttempt.user_id == user.id)
        .first()
    )
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam attempt not found.")
    return attempt


def _is_correct(sq: ExamAttemptQuestion, selected: str) -> bool:
    if sq.question_type == NUMERICAL:
        return numbers_match(selected, sq.correct_answer)
    return selected == sq.correct_answer


def _evaluate_and_finalize_attempt(db: Session, attempt: ExamAttempt) -> ExamAttempt:
    # Lock the attempt row: a manual submit and the timer's auto-submit (or two clicks)
    # can arrive together, and only the first may score the paper. The second waits here,
    # then sees "submitted" and returns the same result.
    db.refresh(attempt, with_for_update=True)
    if attempt.status != "in_progress":
        db.commit()  # release the lock
        return attempt

    ans_by_qid = {a.attempt_question_id: a for a in attempt.answers}
    total_score = 0.0
    correct_count = 0
    incorrect_count = 0
    unanswered_count = 0
    subject_breakdown: dict = {}
    topic_breakdown: dict = {}

    for sq in attempt.questions:
        ans = ans_by_qid.get(sq.id)
        selected = ans.selected_option if ans else None

        s_stat = subject_breakdown.setdefault(
            sq.subject,
            {"score": 0.0, "max_score": 0.0, "correct": 0, "incorrect": 0, "unanswered": 0},
        )
        s_stat["max_score"] += sq.marks

        t_stat = topic_breakdown.setdefault(
            sq.topic,
            {"subject": sq.subject, "attempted": 0, "correct": 0, "incorrect": 0, "unanswered": 0},
        )

        if selected is None or str(selected).strip() == "":
            unanswered_count += 1
            s_stat["unanswered"] += 1
            t_stat["unanswered"] += 1
            if ans:
                ans.is_correct = False
                ans.marks_awarded = 0.0
        else:
            t_stat["attempted"] += 1
            is_correct = _is_correct(sq, str(selected).strip())
            if is_correct:
                correct_count += 1
                s_stat["correct"] += 1
                t_stat["correct"] += 1
                awarded = sq.marks
            else:
                incorrect_count += 1
                s_stat["incorrect"] += 1
                t_stat["incorrect"] += 1
                awarded = -sq.negative_marks

            total_score += awarded
            s_stat["score"] += awarded
            if ans:
                ans.is_correct = is_correct
                ans.marks_awarded = awarded

            # Per-chapter accuracy drives weak topics, which Daily 20 practises first.
            record_topic_outcome(db, attempt.user_id, sq.subject, sq.topic, is_correct)

    attempted_total = correct_count + incorrect_count
    attempt.total_score = total_score
    attempt.correct_count = correct_count
    attempt.incorrect_count = incorrect_count
    attempt.unanswered_count = unanswered_count
    attempt.accuracy = (
        round((correct_count / attempted_total) * 100.0, 2) if attempted_total > 0 else 0.0
    )
    attempt.subject_breakdown = subject_breakdown
    attempt.topic_breakdown = topic_breakdown
    attempt.status = "submitted"
    attempt.submitted_at = utc_now()
    db.commit()
    db.refresh(attempt)
    # Get questions ready for the weak chapters so tomorrow's Daily 20 can target them.
    run_in_background(top_up_weak_topics, attempt.user_id)
    return attempt


def _expire_if_due(db: Session, attempt: ExamAttempt) -> ExamAttempt:
    if attempt.status == "in_progress" and utc_now() >= _ensure_utc(attempt.expires_at):
        return _evaluate_and_finalize_attempt(db, attempt)
    return attempt


def _template_json(t: ExamTemplate) -> dict:
    return {
        "id": t.id,
        "code": t.code,
        "name": t.name,
        "exam_type": t.exam_type,
        "description": t.description,
        "duration_minutes": t.duration_minutes,
        "total_questions": t.total_questions,
        "subject_distribution": paper_pattern(t),
        "default_marks": t.default_marks,
        "default_negative_marks": t.default_negative_marks,
        "is_demo_pattern": t.is_demo_pattern,
    }


@router.get("/templates")
def list_templates(db: Session = Depends(get_db)):
    return [_template_json(t) for t in db.query(ExamTemplate).all()]


@router.get("/bank-status")
def get_bank_status(
    template_code: str = DEFAULT_TEMPLATE,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """How many questions the next paper can take from the bank, and how many must be generated."""
    template = db.query(ExamTemplate).filter(ExamTemplate.code == template_code).first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam template not found.")
    level = exam_level(db, current_user.id)
    subjects = []
    to_generate = 0
    for subject, counts in paper_pattern(template).items():
        row = {"subject": subject, "needed": counts, "available": {}, "to_generate": 0}
        for kind, n in counts.items():
            unseen = unseen_questions(db, current_user.id, subject, kind)
            row["available"][kind] = len(unseen)
            for difficulty, quota in split_by_mix(n, LEVEL_MIX[level]).items():
                have = sum(1 for q in unseen if q.difficulty == difficulty)
                row["to_generate"] += max(0, quota - have)
        to_generate += row["to_generate"]
        subjects.append(row)
    return {
        "template": _template_json(template),
        "difficulty": level_summary(level),
        "subjects": subjects,
        "to_generate": to_generate,
        "estimated_minutes": -(-to_generate // QUESTIONS_PER_MINUTE) if to_generate else 0,
    }


@router.post("/attempts", status_code=status.HTTP_201_CREATED)
def start_exam_attempt(
    payload: ExamStartRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # One paper at a time: a second start resumes the paper already being prepared or taken,
    # which also stops two papers from claiming the same unseen questions.
    for active in (
        db.query(ExamAttempt)
        .filter(ExamAttempt.user_id == current_user.id, ExamAttempt.status.in_(["preparing", "in_progress"]))
        .all()
    ):
        if _expire_if_due(db, active).status in ("preparing", "in_progress"):
            return get_exam_attempt(active.id, current_user, db)

    template = (
        db.query(ExamTemplate)
        .filter(ExamTemplate.code == (payload.template_code or DEFAULT_TEMPLATE))
        .first()
    )
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam template not found.")

    attempt = create_exam_attempt(db, current_user.id, template)
    return get_exam_attempt(attempt.id, current_user, db)


@router.get("/attempts/{attempt_id}")
def get_exam_attempt(
    attempt_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attempt = _expire_if_due(db, _owned_attempt(db, attempt_id, current_user))

    if attempt.status == "preparing" and not is_preparing(attempt.id):
        # The server restarted mid-preparation; pick up where the bank left off.
        start_preparation(attempt.id)

    base = {
        "id": attempt.id,
        "title": attempt.title,
        "exam_type": attempt.exam_type,
        "status": attempt.status,
        "duration_minutes": attempt.duration_minutes,
        "prep_ready": attempt.prep_ready,
        "prep_total": attempt.prep_total,
        "prep_error": attempt.prep_error,
        "difficulty": level_summary(attempt.difficulty_level),
    }
    if attempt.status in ("preparing", "failed"):
        return {**base, "remaining_seconds": attempt.duration_minutes * 60, "questions": []}

    remaining_seconds = max(0, int((_ensure_utc(attempt.expires_at) - utc_now()).total_seconds()))
    if attempt.status == "submitted":
        remaining_seconds = 0

    ans_map = {a.attempt_question_id: a for a in attempt.answers}
    questions_payload = []
    for sq in attempt.questions:
        ans = ans_map.get(sq.id)
        q_item = {
            "id": sq.id,
            "order_index": sq.order_index,
            "subject": sq.subject,
            "question_type": sq.question_type,
            "question_text": sq.question_text,
            "options": sq.options,
            "marks": sq.marks,
            "negative_marks": sq.negative_marks,
            "selected_option": ans.selected_option if ans else None,
            "marked_for_review": ans.marked_for_review if ans else False,
            "time_spent_seconds": ans.time_spent_seconds if ans else 0,
        }
        # Never expose answers, or the chapter (a hint), before submission.
        if attempt.status == "submitted":
            q_item["topic"] = sq.topic
            q_item["correct_answer"] = sq.correct_answer
            q_item["explanation"] = sq.explanation
        questions_payload.append(q_item)

    return {
        **base,
        "started_at": attempt.started_at,
        "expires_at": attempt.expires_at,
        "submitted_at": attempt.submitted_at,
        "remaining_seconds": remaining_seconds,
        "questions": questions_payload,
    }


@router.put("/attempts/{attempt_id}/answers")
def update_exam_answers(
    attempt_id: str,
    payload: ExamAnswersBulkUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attempt = _owned_attempt(db, attempt_id, current_user)
    if attempt.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Answers can only be changed while the exam is running.",
        )
    if utc_now() >= _ensure_utc(attempt.expires_at):
        _evaluate_and_finalize_attempt(db, attempt)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Exam time has expired; attempt was auto-submitted.",
        )

    questions = {sq.id: sq for sq in attempt.questions}
    ans_map = {a.attempt_question_id: a for a in attempt.answers}

    for item in payload.answers:
        sq = questions.get(item.attempt_question_id)
        if not sq:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Question {item.attempt_question_id} does not belong to this attempt.",
            )
        selected = (item.selected_option or "").strip() or None
        if selected and sq.question_type != NUMERICAL and selected not in sq.options:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That option isn't part of the question.")
        ans = ans_map.get(item.attempt_question_id)
        if ans:
            ans.selected_option = selected
            ans.marked_for_review = item.marked_for_review
            ans.time_spent_seconds = max(0, item.time_spent_seconds)

    db.commit()
    return {"status": "updated", "attempt_id": attempt.id}


@router.post("/attempts/{attempt_id}/submit")
def submit_exam_attempt(
    attempt_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attempt = _owned_attempt(db, attempt_id, current_user)
    if attempt.status not in ("in_progress", "submitted"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This paper isn't ready yet.")
    _evaluate_and_finalize_attempt(db, attempt)
    return get_exam_result(attempt_id, current_user, db)


@router.delete("/attempts/{attempt_id}", status_code=status.HTTP_204_NO_CONTENT)
def discard_exam_attempt(
    attempt_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel a paper that is still being prepared or failed to prepare."""
    attempt = _owned_attempt(db, attempt_id, current_user)
    if attempt.status not in ("preparing", "failed"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only papers that haven't started can be discarded.")
    db.delete(attempt)
    db.commit()


@router.get("/history")
def list_exam_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attempts = (
        db.query(ExamAttempt)
        .filter(ExamAttempt.user_id == current_user.id)
        .order_by(ExamAttempt.started_at.desc())
        .all()
    )
    return [
        {
            "id": a.id,
            "title": a.title,
            "exam_type": a.exam_type,
            "status": a.status,
            "total_score": a.total_score,
            "max_score": a.max_score,
            "accuracy": a.accuracy,
            "correct_count": a.correct_count,
            "incorrect_count": a.incorrect_count,
            "unanswered_count": a.unanswered_count,
            "difficulty_level": a.difficulty_level,
            "started_at": a.started_at,
            "submitted_at": a.submitted_at,
        }
        for a in attempts
    ]


def _weak_topics_for(db: Session, attempt: ExamAttempt) -> list:
    """Chapters where marks were lost in this paper, with the stored weak-topic severity."""
    severity = {
        (r.subject, r.topic): r
        for r in db.query(UserTopicProgress).filter(UserTopicProgress.user_id == attempt.user_id)
    }
    rows = []
    for topic, stat in (attempt.topic_breakdown or {}).items():
        lost = stat.get("incorrect", 0) + stat.get("unanswered", 0)
        if not lost:
            continue
        progress = severity.get((stat["subject"], topic))
        rows.append({
            "subject": stat["subject"],
            "topic": topic,
            "correct": stat.get("correct", 0),
            "incorrect": stat.get("incorrect", 0),
            "unanswered": stat.get("unanswered", 0),
            "overall_accuracy": progress.accuracy if progress else None,
            "weak_severity": progress.weak_severity if progress else "none",
        })
    rank = {"high": 0, "medium": 1, "low": 2, "none": 3}
    return sorted(rows, key=lambda r: (rank.get(r["weak_severity"], 3), -r["incorrect"], -r["unanswered"]))


@router.get("/attempts/{attempt_id}/result")
def get_exam_result(
    attempt_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attempt = _expire_if_due(db, _owned_attempt(db, attempt_id, current_user))
    if attempt.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam attempt has not been submitted yet.",
        )

    ans_map = {a.attempt_question_id: a for a in attempt.answers}
    questions_review = []
    total_time_spent = 0
    by_difficulty = {d: {"total": 0, "correct": 0} for d in DIFFICULTIES}
    for sq in attempt.questions:
        ans = ans_map.get(sq.id)
        bucket = by_difficulty.setdefault(sq.difficulty, {"total": 0, "correct": 0})
        bucket["total"] += 1
        bucket["correct"] += int(bool(ans and ans.is_correct))
        t_spent = ans.time_spent_seconds if ans else 0
        total_time_spent += t_spent
        questions_review.append(
            {
                "id": sq.id,
                "order_index": sq.order_index,
                "subject": sq.subject,
                "topic": sq.topic,
                "difficulty": sq.difficulty,
                "question_type": sq.question_type,
                "question_text": sq.question_text,
                "options": sq.options,
                "selected_option": ans.selected_option if ans else None,
                "correct_answer": sq.correct_answer,
                "is_correct": ans.is_correct if ans else False,
                "marks_awarded": ans.marks_awarded if ans else 0.0,
                "time_spent_seconds": t_spent,
                "explanation": sq.explanation,
                "source_ref": sq.source_ref,
            }
        )

    return {
        "attempt_id": attempt.id,
        "title": attempt.title,
        "exam_type": attempt.exam_type,
        "status": attempt.status,
        "total_score": attempt.total_score,
        "max_score": attempt.max_score,
        "correct_count": attempt.correct_count,
        "incorrect_count": attempt.incorrect_count,
        "unanswered_count": attempt.unanswered_count,
        "accuracy": attempt.accuracy,
        "time_spent_seconds": total_time_spent,
        "subject_breakdown": attempt.subject_breakdown,
        "topic_breakdown": attempt.topic_breakdown,
        "weak_topics": _weak_topics_for(db, attempt),
        "difficulty": level_summary(attempt.difficulty_level),
        "difficulty_breakdown": by_difficulty,
        "next_difficulty": level_summary(exam_level(db, attempt.user_id)),
        "submitted_at": attempt.submitted_at,
        "questions": questions_review,
    }
