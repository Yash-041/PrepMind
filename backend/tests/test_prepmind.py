import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["LLM_PROVIDER"] = "mock"
os.environ["EMBEDDING_PROVIDER"] = "mock"
# Never send real email from tests (backend/.env holds the Gmail settings; values set
# here win because load_dotenv doesn't override existing variables).
os.environ["SMTP_USER"] = ""
os.environ["SMTP_PASSWORD"] = ""
# ...and never call Groq/Gemini (chat titles, question generation) with the real keys.
os.environ["GROQ_API_KEY"] = ""
os.environ["LLM_API_KEY"] = ""

from backend.lib.db import Base, get_db
from backend.server import app
from backend.services.seed_bank import seed_initial_data
from backend.services.math_verifier import (
    are_expressions_equivalent,
    safe_parse,
)

TEST_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=TEST_ENGINE
)


@pytest.fixture(autouse=True)
def setup_test_db():
    from backend.lib import rate_limit

    # Every test signs up from the same test client address; start each with clean limits.
    for limiter in vars(rate_limit).values():
        if isinstance(limiter, rate_limit.SlidingWindowLimiter):
            limiter._events.clear()
    Base.metadata.create_all(bind=TEST_ENGINE)
    with TestingSessionLocal() as db:
        seed_initial_data(db)
    yield
    Base.metadata.drop_all(bind=TEST_ENGINE)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def register_student(email="yash@example.com", name="Yash Sharma"):
    return client.post(
        "/api/auth/signup",
        json={
            "full_name": name,
            "email": email,
            "target_exam": "JEE Main",
            "student_class": "Class 12",
            "password": "StrongPassword123",
            "confirm_password": "StrongPassword123",
        },
    )


def verify_email(email: str):
    """What clicking the emailed link does: POST the token to /verify-email."""
    from backend.lib.security import create_email_verification_token
    from backend.models.user import User

    with TestingSessionLocal() as db:
        user = db.query(User).filter(User.email == email.lower()).one()
        token = create_email_verification_token(user.id, user.email)
    return client.post("/api/auth/verify-email", json={"token": token})


def login(email: str, password: str = "StrongPassword123"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def signup_verified(email: str, name: str = "Yash Sharma") -> str:
    """Sign up, verify the email and log in; returns the access token."""
    assert register_student(email, name).status_code == 201
    assert verify_email(email).status_code == 200
    r = login(email)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_signup_duplicate_and_login():
    r1 = register_student("student1@example.com")
    assert r1.status_code == 201
    assert r1.json()["email"] == "student1@example.com"
    assert "password" not in str(r1.json())

    # Duplicate email rejected
    r_dup = register_student("STUDENT1@example.com")
    assert r_dup.status_code == 409

    # Login is refused until the email is verified
    r_unverified = login("student1@example.com")
    assert r_unverified.status_code == 403
    assert r_unverified.json()["detail"]["code"] == "email_not_verified"

    # Verified: login works
    assert verify_email("student1@example.com").status_code == 200
    r_login = login("student1@example.com")
    assert r_login.status_code == 200
    token = r_login.json()["access_token"]

    # /api/auth/me works
    r_me = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert r_me.status_code == 200
    assert r_me.json()["email"] == "student1@example.com"


def test_user_isolation_and_rag_chat(monkeypatch):
    import backend.routers.chats as chats_router

    # The tutor graph needs pgvector (not in the SQLite test DB) and an LLM; stand in for it
    # with what it returns, so this tests the chat API: saving, sources, ownership.
    def fake_tutor(db, question, history, model):
        return {
            "answer": "For a solid sphere, $I = \\frac{2}{5}MR^2$ [1].",
            "sources": [{"ref": 1, "source_file": "chapter 7.pdf", "doc_type": "book", "subject": "Physics",
                         "chapter": "Systems of Particles and Rotational Motion", "page_number": 12,
                         "excerpt": "moment of inertia of a solid sphere", "similarity": 0.8}],
            "is_fallback": False,
            "detected_subject": "Physics",
        }

    monkeypatch.setattr(chats_router, "run_rag_tutor", fake_tutor)
    u1 = signup_verified("u1@example.com")
    u2 = signup_verified("u2@example.com")

    c_resp = client.post(
        "/api/chats",
        json={"title": "Rotational Doubt"},
        headers={"Authorization": f"Bearer {u1}"},
    )
    assert c_resp.status_code == 201
    chat_id = c_resp.json()["id"]

    m_resp = client.post(
        f"/api/chats/{chat_id}/messages",
        json={"content": "What is the moment of inertia of a solid sphere?"},
        headers={"Authorization": f"Bearer {u1}"},
    )
    assert m_resp.status_code == 200, m_resp.text
    assistant_msg = m_resp.json()["assistant_message"]
    assert "\\frac{2}{5}MR^2" in assistant_msg["content"]
    assert len(assistant_msg["sources"]) == 1

    # User 2 cannot access User 1's conversation
    forbidden = client.get(
        f"/api/chats/{chat_id}", headers={"Authorization": f"Bearer {u2}"}
    )
    assert forbidden.status_code == 404


def test_daily_20_idempotency_and_scoring():
    token = signup_verified("daily@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    s1 = client.get("/api/daily-practice/today", headers=headers).json()
    s2 = client.get("/api/daily-practice/today", headers=headers).json()
    assert s1["id"] == s2["id"]
    assert len(s1["questions"]) == 20
    # Correct answer hidden before submission
    assert "correct_answer" not in s1["questions"][0]

    # Submit answers
    sub = client.post(
        f"/api/daily-practice/{s1['id']}/submit",
        json={
            "answers": [
                {
                    "question_id": s1["questions"][0]["id"],
                    "selected_option": s1["questions"][0]["options"][0],
                }
            ]
        },
        headers=headers,
    )
    assert sub.status_code == 200
    assert "score" in sub.json()

    # Duplicate submission prevented
    dup_sub = client.post(
        f"/api/daily-practice/{s1['id']}/submit",
        json={"answers": []},
        headers=headers,
    )
    assert dup_sub.status_code == 409


def _fill_test_bank():
    """A knowledge-base bank big enough for one JEE Main paper at any difficulty mix."""
    from backend.models.practice import Question

    with TestingSessionLocal() as db:
        for subject in ("Physics", "Chemistry", "Mathematics"):
            for difficulty in ("Easy", "Medium", "Hard"):
                for i in range(12):
                    db.add(Question(
                        subject=subject, topic=f"{subject} chapter {i % 3}", exam_type="JEE Main",
                        difficulty=difficulty, question_text=f"{subject} {difficulty} MCQ {i}: pick option A.",
                        options=["A", "B", "C", "D"], correct_answer="A", explanation="A.",
                        marks=4.0, negative_marks=1.0, is_generated=True, math_verified=True,
                        question_type="mcq", source="kb", content_hash=f"{subject}-{difficulty}-mcq-{i}",
                    ))
                for i in range(3):
                    db.add(Question(
                        subject=subject, topic=f"{subject} chapter {i}", exam_type="JEE Main",
                        difficulty=difficulty, question_text=f"{subject} {difficulty} numerical {i}: 2 + 2?",
                        options=[], correct_answer="4", explanation="4.",
                        marks=4.0, negative_marks=1.0, is_generated=True, math_verified=True,
                        question_type="numerical", source="kb", content_hash=f"{subject}-{difficulty}-num-{i}",
                    ))
        db.commit()


def test_exam_simulator_and_weak_topic_tracking(monkeypatch):
    import backend.routers.exams as exams_router
    import backend.services.exam_graph as exam_graph
    import backend.services.question_bank as question_bank

    # Prepare the paper right away against the test DB (in the app it's a background
    # thread on the real DB), and skip the post-exam question top-up (needs an LLM).
    monkeypatch.setattr(exam_graph, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(question_bank, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(exam_graph, "start_preparation", exam_graph._prepare)
    monkeypatch.setattr(exams_router, "run_in_background", lambda *a, **k: None)
    _fill_test_bank()

    token = signup_verified("exam@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    created = client.post("/api/exams/attempts", json={"template_code": "JEE_MAIN_FULL"}, headers=headers)
    assert created.status_code == 201, created.text
    attempt_id = created.json()["id"]
    # The app answers "preparing" first and the page polls; here preparation already ran.
    attempt = client.get(f"/api/exams/attempts/{attempt_id}", headers=headers).json()
    assert attempt["status"] == "in_progress", attempt.get("prep_error")
    questions = attempt["questions"]
    # JEE Main pattern: per subject 20 MCQ + 5 numerical.
    assert len(questions) == 75
    assert sum(q["question_type"] == "numerical" for q in questions) == 15
    # Answers and chapters stay hidden until submission.
    assert "correct_answer" not in questions[0] and "topic" not in questions[0]

    # An option that isn't part of the question is refused.
    bad = client.put(
        f"/api/exams/attempts/{attempt_id}/answers",
        json={"answers": [{"attempt_question_id": questions[0]["id"], "selected_option": "Z",
                           "marked_for_review": False, "time_spent_seconds": 1}]},
        headers=headers,
    )
    assert bad.status_code == 400

    # Four wrong MCQ answers -> -4 and weak topics.
    mcqs = [q for q in questions if q["question_type"] == "mcq"][:4]
    upd = client.put(
        f"/api/exams/attempts/{attempt_id}/answers",
        json={"answers": [{"attempt_question_id": q["id"], "selected_option": "B",
                           "marked_for_review": True, "time_spent_seconds": 12} for q in mcqs]},
        headers=headers,
    )
    assert upd.status_code == 200

    res = client.post(f"/api/exams/attempts/{attempt_id}/submit", headers=headers)
    assert res.status_code == 200
    assert res.json()["incorrect_count"] == 4
    assert res.json()["total_score"] == -4.0

    # Submitting again returns the same result and doesn't score the paper twice.
    again = client.post(f"/api/exams/attempts/{attempt_id}/submit", headers=headers)
    assert again.status_code == 200
    assert again.json()["total_score"] == -4.0

    weak = client.get("/api/progress/weak-topics", headers=headers).json()
    assert len(weak) >= 1
    assert sum(w["attempted_count"] for w in weak) == 4  # progress counted once, not twice


def test_google_sign_in_drops_password_set_before_verification(monkeypatch):
    """Someone signs up with another person's email; when the owner later uses Google, the
    stranger's password must stop working (account pre-takeover)."""
    import google.oauth2.id_token as google_id_token
    from backend.lib.config import settings

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(google_id_token, "verify_oauth2_token", lambda *a, **k: {
        "iss": "accounts.google.com", "email_verified": True,
        "email": "victim@example.com", "sub": "google-123", "name": "Victim",
    })

    assert register_student("victim@example.com", "Attacker").status_code == 201  # never verified
    google = client.post("/api/auth/google", json={"id_token": "test-google-id-token"})
    assert google.status_code == 200
    assert google.json()["user"]["has_password"] is False
    assert login("victim@example.com").status_code == 401  # the attacker's password is gone


def test_google_sign_in_keeps_password_of_verified_account(monkeypatch):
    import google.oauth2.id_token as google_id_token
    from backend.lib.config import settings

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(google_id_token, "verify_oauth2_token", lambda *a, **k: {
        "iss": "accounts.google.com", "email_verified": True,
        "email": "owner@example.com", "sub": "google-456", "name": "Owner",
    })
    signup_verified("owner@example.com")
    assert client.post("/api/auth/google", json={"id_token": "test-google-id-token"}).status_code == 200
    assert login("owner@example.com").status_code == 200  # unchanged for verified accounts


def test_login_is_limited_after_repeated_wrong_passwords():
    signup_verified("limit@example.com")
    for _ in range(5):
        assert login("limit@example.com", "WrongPassword1").status_code == 401
    # Even the right password waits once the limit is reached.
    blocked = login("limit@example.com")
    assert blocked.status_code == 429
    assert "Too many failed login attempts" in blocked.json()["detail"]


def test_successful_login_resets_the_failure_count():
    signup_verified("reset@example.com")
    for _ in range(4):
        login("reset@example.com", "WrongPassword1")
    assert login("reset@example.com").status_code == 200
    for _ in range(4):
        assert login("reset@example.com", "WrongPassword1").status_code == 401
    assert login("reset@example.com").status_code == 200


def test_sympy_safe_verification():
    assert are_expressions_equivalent("(2/5)*m*R^2", "0.4*m*R^2") is True
    assert are_expressions_equivalent("sin(x)^2 + cos(x)^2", "1") is True
    # Relative tolerance: small numbers that differ a lot aren't "equal".
    assert are_expressions_equivalent("0.0001", "0.0009") is False
    assert are_expressions_equivalent("6250", "6250.0") is True
    with pytest.raises(ValueError):
        safe_parse("__import__('os').system('echo hacked')")
    with pytest.raises(ValueError):
        safe_parse("Symbol.mro()")  # no attribute access on SymPy objects

def test_progress_report_reflects_submitted_daily_set():
    # Created directly: signup now waits on email verification before issuing a token.
    from backend.lib.security import create_access_token
    from backend.models.user import User

    with TestingSessionLocal() as db:
        user = User(full_name="Report Student", email="report@example.com", target_exam="JEE Main", student_class="Class 12", is_verified=True)
        db.add(user)
        db.commit()
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

    empty = client.get("/api/progress/report", headers=headers).json()
    assert empty["stats"]["questions_attempted"] == 0
    assert empty["recent_activity"] == []
    assert [s["subject"] for s in empty["subjects"]] == ["Physics", "Chemistry", "Mathematics"]

    practice = client.get("/api/daily-practice/today", headers=headers).json()
    client.post(
        f"/api/daily-practice/{practice['id']}/submit",
        json={"answers": [{"question_id": q["id"], "selected_option": "DEFINITELY_WRONG_OPTION"} for q in practice["questions"][:3]]},
        headers=headers,
    )

    report = client.get("/api/progress/report", headers=headers).json()
    assert report["stats"]["daily_sets_completed"] == 1
    assert report["stats"]["questions_attempted"] >= 3
    assert report["stats"]["current_streak"] == 1
    assert report["recent_activity"][0]["kind"] == "daily"
    assert report["weak_topics"], "wrong answers should surface weak topics"


def test_streak_counting_rules():
    from datetime import date, timedelta
    from backend.services.streaks import current_streak, longest_streak

    today = date(2026, 10, 24)
    days = {today - timedelta(days=n) for n in (1, 2, 3, 6, 7)}
    # Today not solved yet: the streak still stands from yesterday.
    assert current_streak(days, today) == 3
    assert current_streak(days | {today}, today) == 4
    # Missing yesterday and today breaks it.
    assert current_streak({today - timedelta(days=2)}, today) == 0
    assert longest_streak(days) == 3
    assert longest_streak(set()) == 0


def test_daily_streak_endpoint_counts_same_day_submission():
    from backend.lib.security import create_access_token
    from backend.models.user import User

    with TestingSessionLocal() as db:
        user = User(full_name="Streak Student", email="streak@example.com", target_exam="JEE Main", student_class="Class 12", is_verified=True)
        db.add(user)
        db.commit()
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

    before = client.get("/api/daily-practice/streak", headers=headers).json()
    assert before["current_streak"] == 0 and not before["solved_today"]
    assert len(before["calendar"]) == 28

    practice = client.get("/api/daily-practice/today", headers=headers).json()
    result = client.post(f"/api/daily-practice/{practice['id']}/submit", json={"answers": []}, headers=headers).json()
    assert result["counted_for_streak"] is True

    after = client.get("/api/daily-practice/streak", headers=headers).json()
    assert after["current_streak"] == 1
    assert after["longest_streak"] == 1
    assert after["solved_today"] is True
    assert after["calendar"][-1]["solved"] is True


def test_difficulty_levels_move_with_accuracy():
    from backend.services.difficulty import next_level, split_by_mix, LEVEL_MIX

    # Foundation -> JEE Main at 50% accuracy, but only if half the paper was attempted.
    assert next_level("foundation", 55.0, 0.8) == "jee_main"
    assert next_level("foundation", 90.0, 0.2) == "foundation"
    assert next_level("foundation", 10.0, 1.0) == "foundation"
    # JEE Main -> Advanced at 70%, back to Foundation below 35%, otherwise stays.
    assert next_level("jee_main", 72.0, 0.9) == "advanced"
    assert next_level("jee_main", 30.0, 0.9) == "foundation"
    assert next_level("jee_main", 50.0, 0.9) == "jee_main"
    assert next_level("advanced", 50.0, 0.9) == "jee_main"
    assert next_level("advanced", 80.0, 0.9) == "advanced"

    assert split_by_mix(20, LEVEL_MIX["foundation"]) == {"Easy": 10, "Medium": 6, "Hard": 4}
    assert split_by_mix(20, LEVEL_MIX["jee_main"]) == {"Easy": 6, "Medium": 10, "Hard": 4}
    five = split_by_mix(5, LEVEL_MIX["foundation"])
    assert sum(five.values()) == 5 and five["Easy"] >= five["Medium"] >= five["Hard"]


def test_daily_set_puts_weak_topics_first_with_easier_questions():
    from backend.models.practice import Question
    from backend.models.progress import UserTopicProgress
    from backend.models.user import User
    from backend.services.daily_graph import get_or_create_daily_set

    with TestingSessionLocal() as db:
        user = User(full_name="Weak Student", email="weak@example.com", target_exam="JEE Main", student_class="Class 12", is_verified=True)
        db.add(user)
        db.flush()
        for i, difficulty in enumerate(["Hard", "Easy", "Medium", "Easy", "Hard", "Medium"]):
            db.add(Question(subject="Physics", topic="Waves", difficulty=difficulty, question_text=f"Waves question {i} about frequency?",
                            options=["a", "b", "c", "d"], correct_answer="a", explanation="x", source="kb", content_hash=f"waves-{i}"))
        db.add(UserTopicProgress(user_id=user.id, subject="Physics", topic="Waves", attempted_count=4, correct_count=0,
                                 incorrect_count=4, accuracy=0.0, recent_accuracy=0.0, weak_severity="high"))
        db.commit()

        pset = get_or_create_daily_set(db, user.id, "JEE Main")
        weak = [item.question for item in pset.items[:4]]
        assert all(q.topic == "Waves" for q in weak)
        # 4 per weak chapter, easiest first: both Easy, then both Medium; no Hard.
        assert [q.difficulty for q in weak] == ["Easy", "Easy", "Medium", "Medium"]


def test_delete_chat_removes_it_and_only_for_its_owner():
    from backend.lib.security import create_access_token
    from backend.models.user import User

    with TestingSessionLocal() as db:
        owner = User(full_name="Owner", email="owner@example.com", target_exam="JEE Main", student_class="Class 12", is_verified=True)
        other = User(full_name="Other", email="other@example.com", target_exam="JEE Main", student_class="Class 12", is_verified=True)
        db.add_all([owner, other])
        db.commit()
        owner_h = {"Authorization": f"Bearer {create_access_token(owner.id, owner.email)}"}
        other_h = {"Authorization": f"Bearer {create_access_token(other.id, other.email)}"}

    chat = client.post("/api/chats", json={}, headers=owner_h).json()
    assert client.delete(f"/api/chats/{chat['id']}", headers=other_h).status_code == 404
    assert client.delete(f"/api/chats/{chat['id']}", headers=owner_h).status_code == 204
    assert client.get(f"/api/chats/{chat['id']}", headers=owner_h).status_code == 404
    assert all(c["id"] != chat["id"] for c in client.get("/api/chats", headers=owner_h).json())


def test_chat_title_fallback_cuts_at_a_word():
    from backend.services.chat_titles import fallback_title, _clean

    assert fallback_title("State Hund's rule and give the electronic configuration of nitrogen.") == "State Hund's rule and give the electronic…"
    assert fallback_title("what is $F = ma$?") == "What is F = ma"
    assert fallback_title("   ") == "New JEE Doubt Session"
    assert _clean('Title: "Hund\'s Rule and Nitrogen Configuration."') == "Hund's Rule and Nitrogen Configuration"
    assert _clean("$E = mc^2$ explained") is None


def test_cut_off_answer_gets_closed_math_and_a_note():
    from backend.services.rag_graph import TRUNCATION_NOTE, _close_open_math, _hit_length_limit

    assert _hit_length_limit({"finish_reason": "length"})
    assert _hit_length_limit({"finish_reason": "MAX_TOKENS"})
    assert not _hit_length_limit({"finish_reason": "stop"}) and not _hit_length_limit(None)
    cut = "Total:\n$$\nK = 56\text{ J}\n$$\n\n**Loss:**\n$$ \\Delta K = K_{\text"
    fixed = cut + _close_open_math(cut) + TRUNCATION_NOTE
    assert fixed.count("$$") % 2 == 0 and fixed.endswith("Reply **continue** to get the rest.*")
    assert _close_open_math("done $$x$$") == ""
