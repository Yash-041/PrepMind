from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.lib.db import get_db
from backend.lib.security import get_current_user
from backend.models.user import User
from backend.models.practice import (
    DailyPracticeSet,
    DailyPracticeAttempt,
    DailyPracticeAnswer,
)
from backend.schemas.api_schemas import DailySubmitRequest
from backend.services.daily_graph import get_or_create_daily_set
from backend.services.math_verifier import are_expressions_equivalent
from backend.services.progress_tracker import record_topic_outcome
from backend.services.question_bank import run_in_background, top_up_weak_topics
from backend.services.streaks import solved_days, streak_summary

router = APIRouter(prefix="/api/daily-practice", tags=["Daily 20 Practice"])


def _serialize_set(pset: DailyPracticeSet) -> dict:
    include_keys = pset.is_submitted
    questions_out = []
    for item in pset.items:
        q = item.question
        q_dict = {
            "id": q.id,
            "order_index": item.order_index,
            "subject": q.subject,
            "topic": q.topic,
            "difficulty": q.difficulty,
            "question_text": q.question_text,
            "options": q.options,
            "marks": q.marks,
            "negative_marks": q.negative_marks,
            "is_pyq": q.is_pyq,
            "is_generated": q.is_generated,
            "question_type": q.question_type,
        }
        if include_keys:
            q_dict["correct_answer"] = q.correct_answer
            q_dict["explanation"] = q.explanation
        questions_out.append(q_dict)

    return {
        "id": pset.id,
        "set_date": str(pset.set_date),
        "target_exam": pset.target_exam,
        "is_submitted": pset.is_submitted,
        "total_questions": len(questions_out),
        "questions": questions_out,
    }


@router.get("/today")
def get_today_practice(
    target_exam: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    exam = target_exam or current_user.target_exam
    pset = get_or_create_daily_set(db, current_user.id, exam)
    return _serialize_set(pset)


@router.post("/generate")
def generate_today_practice(
    target_exam: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    exam = target_exam or current_user.target_exam
    pset = get_or_create_daily_set(db, current_user.id, exam)
    return _serialize_set(pset)


@router.get("/history")
def get_daily_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sets = (
        db.query(DailyPracticeSet)
        .filter(DailyPracticeSet.user_id == current_user.id)
        .order_by(DailyPracticeSet.set_date.desc())
        .all()
    )
    out = []
    for s in sets:
        out.append(
            {
                "set_id": s.id,
                "set_date": str(s.set_date),
                "target_exam": s.target_exam,
                "is_submitted": s.is_submitted,
                "score": s.attempt.score if s.attempt else None,
                "max_score": s.attempt.max_score if s.attempt else None,
                "accuracy": s.attempt.accuracy if s.attempt else None,
            }
        )
    return out


@router.get("/streak")
def get_daily_streak(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return streak_summary(db, current_user.id)


@router.get("/{set_id}")
def get_practice_set_by_id(
    set_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pset = (
        db.query(DailyPracticeSet)
        .filter(
            DailyPracticeSet.id == set_id,
            DailyPracticeSet.user_id == current_user.id,
        )
        .first()
    )
    if not pset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Daily set not found."
        )
    return _serialize_set(pset)


@router.post("/{set_id}/submit")
def submit_daily_practice(
    set_id: str,
    payload: DailySubmitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pset = (
        db.query(DailyPracticeSet)
        .filter(
            DailyPracticeSet.id == set_id,
            DailyPracticeSet.user_id == current_user.id,
        )
        .first()
    )
    if not pset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Daily set not found."
        )

    if pset.is_submitted and pset.attempt:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This daily practice set has already been submitted.",
        )

    submitted_map = {a.question_id: a.selected_option for a in payload.answers}

    total_score = 0.0
    max_score = 0.0
    correct_count = 0
    incorrect_count = 0
    unanswered_count = 0
    topic_stats: dict = {}
    answer_records = []

    for item in pset.items:
        q = item.question
        max_score += q.marks
        selected = submitted_map.get(q.id)

        t_entry = topic_stats.setdefault(
            q.topic,
            {"subject": q.subject, "attempted": 0, "correct": 0, "incorrect": 0},
        )

        if selected is None or str(selected).strip() == "":
            unanswered_count += 1
            is_correct = False
            awarded = 0.0
        else:
            t_entry["attempted"] += 1
            # A listed option is right only if it is the key (another option that happens to
            # be numerically close is still a wrong pick); equivalence is for typed answers.
            is_correct = (selected == q.correct_answer) or (
                selected not in (q.options or [])
                and are_expressions_equivalent(str(selected), q.correct_answer)
            )
            if is_correct:
                correct_count += 1
                t_entry["correct"] += 1
                awarded = q.marks
            else:
                incorrect_count += 1
                t_entry["incorrect"] += 1
                awarded = -q.negative_marks

            record_topic_outcome(db, current_user.id, q.subject, q.topic, is_correct)

        total_score += awarded
        answer_records.append(
            {
                "question_id": q.id,
                "selected_option": selected,
                "is_correct": is_correct,
                "marks_awarded": awarded,
            }
        )

    attempted_total = correct_count + incorrect_count
    accuracy = (
        round((correct_count / attempted_total) * 100.0, 2)
        if attempted_total > 0
        else 0.0
    )

    attempt = DailyPracticeAttempt(
        set_id=pset.id,
        user_id=current_user.id,
        score=total_score,
        max_score=max_score,
        correct_count=correct_count,
        incorrect_count=incorrect_count,
        unanswered_count=unanswered_count,
        accuracy=accuracy,
        topic_breakdown=topic_stats,
    )
    db.add(attempt)
    db.flush()

    for rec in answer_records:
        db.add(
            DailyPracticeAnswer(
                attempt_id=attempt.id,
                question_id=rec["question_id"],
                selected_option=rec["selected_option"],
                is_correct=rec["is_correct"],
                marks_awarded=rec["marks_awarded"],
            )
        )

    pset.is_submitted = True
    db.commit()
    run_in_background(top_up_weak_topics, current_user.id)
    return get_daily_result(set_id, current_user, db)


@router.get("/{set_id}/result")
def get_daily_result(
    set_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pset = (
        db.query(DailyPracticeSet)
        .filter(
            DailyPracticeSet.id == set_id,
            DailyPracticeSet.user_id == current_user.id,
        )
        .first()
    )
    if not pset or not pset.is_submitted or not pset.attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Result not available until the daily set is submitted.",
        )

    attempt = pset.attempt
    ans_map = {a.question_id: a for a in attempt.answers}
    questions_review = []
    for item in pset.items:
        q = item.question
        ans = ans_map.get(q.id)
        questions_review.append(
            {
                "question_id": q.id,
                "order_index": item.order_index,
                "subject": q.subject,
                "topic": q.topic,
                "question_text": q.question_text,
                "options": q.options,
                "selected_option": ans.selected_option if ans else None,
                "correct_answer": q.correct_answer,
                "is_correct": ans.is_correct if ans else False,
                "marks_awarded": ans.marks_awarded if ans else 0.0,
                "explanation": q.explanation,
            }
        )

    return {
        "set_id": pset.id,
        "set_date": str(pset.set_date),
        "target_exam": pset.target_exam,
        "score": attempt.score,
        "max_score": attempt.max_score,
        "correct_count": attempt.correct_count,
        "incorrect_count": attempt.incorrect_count,
        "unanswered_count": attempt.unanswered_count,
        "accuracy": attempt.accuracy,
        "topic_breakdown": attempt.topic_breakdown,
        "submitted_at": attempt.submitted_at,
        "counted_for_streak": pset.set_date in solved_days(db, current_user.id),
        "questions": questions_review,
    }