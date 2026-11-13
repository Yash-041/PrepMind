"""
One-off clean-up of questions saved before question_text.py existed:

    python -m backend.services.repair_questions          # show what would change
    python -m backend.services.repair_questions --apply  # write the changes

- Repairs LaTeX in question text and explanations, in the bank and in exam-paper snapshots.
- Retires bank questions that refer to another question ("for the same problem"):
  source becomes "retired", so no exam or Daily 20 picks them again, while students'
  past attempts that used them stay intact.
"""
import argparse

from backend.lib.db import SessionLocal
from backend.models.exam import ExamAttemptQuestion
from backend.models.practice import Question
from backend.services.question_text import repair_latex, text_problems


def _repair_row(row) -> bool:
    # Options and answer keys are left alone: saved student answers store the chosen
    # option's text, so changing it would break past results. The frontend repairs
    # options when it shows them.
    changed = False
    for field in ("question_text", "explanation"):
        old = getattr(row, field) or ""
        new = repair_latex(old)
        if new != old:
            setattr(row, field, new)
            changed = True
    return changed


def main(apply: bool) -> None:
    with SessionLocal() as db:
        bank = db.query(Question).all()
        snapshots = db.query(ExamAttemptQuestion).all()
        repaired_bank = sum(_repair_row(q) for q in bank)
        repaired_snap = sum(_repair_row(s) for s in snapshots)
        retired = []
        for q in bank:
            if q.source in ("kb", "seed") and "refers to another question" in text_problems(q.question_text):
                q.source = "retired"
                retired.append(q)
        print(f"LaTeX repaired: {repaired_bank} bank questions, {repaired_snap} exam-paper questions")
        print(f"Retired (refer to another question): {len(retired)}")
        for q in retired:
            print(f"   {q.id[:8]}  {q.question_text[:100]}")
        if apply:
            db.commit()
            print("Changes saved.")
        else:
            db.rollback()
            print("Dry run: nothing saved. Add --apply to save.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true")
    main(parser.parse_args().apply)
