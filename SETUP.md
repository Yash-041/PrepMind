# PrepMind AI — Setup Guide

How to run PrepMind AI on a new laptop, including the data that GitHub does not hold.

## What GitHub has and what it doesn't

`git clone` gives you the **code only**. Three things are kept out of the repository on purpose:

| Needed for | Item | Why it is not on GitHub |
|---|---|---|
| Everything | `.env` files (API keys, passwords) | Secrets |
| Tutor search, question bank, users, exams | The PostgreSQL database (embeddings of 6,008 text chunks, question bank, accounts, progress) | Holds user data; lives in a Docker volume |
| Generating new questions, re-embedding | `backend/data/knowledge_base/` (130 PDFs, ~354 MB) | NCERT / NTA material is copyrighted; too large |

Copy these from a laptop that already runs PrepMind (**Option A**, about 10 minutes), or build them from scratch (**Option B**, several days on the free Gemini quota).

---

## 1. Install the tools

| Tool | Needed for | Download |
|---|---|---|
| **Git** | Cloning the code | https://git-scm.com/downloads |
| **Docker Desktop** | Running the app (database, backend, frontend) | https://www.docker.com/products/docker-desktop |
| Python 3.14 and Node.js 24 | *Only* for development mode (section 6) | python.org, nodejs.org |

Start Docker Desktop and wait until it shows **"Engine running"**.

## 2. Get the code

```bash
git clone https://github.com/Yash-041/PrepMind.git
cd PrepMind
```

All commands below run from this `PrepMind` folder.

## 3. Create the `.env` files

There are three. Each has an example file next to it.

| File | Copy from | What goes in it |
|---|---|---|
| `PrepMind/.env` | `.env.example` | `POSTGRES_PASSWORD`, the database password |
| `backend/.env` | `backend/.env.example` | API keys, email, login secret (see below) |
| `frontend/.env` | `frontend/.env.example` | Google sign-in client ID (optional) |

**Moving from your own laptop:** copy the three real `.env` files across (USB drive or Google Drive, never GitHub) and skip to step 4.

**Starting fresh:** copy each example and fill in `backend/.env`:

| Setting | Value |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://postgres:<POSTGRES_PASSWORD>@localhost:5433/prepmind` (same password as `PrepMind/.env`) |
| `JWT_SECRET_KEY` | A long random string, e.g. `python -c "import secrets; print(secrets.token_hex(32))"` |
| `LLM_PROVIDER` / `LLM_MODEL` | `groq` / `openai/gpt-oss-120b` |
| `GROQ_API_KEY` | Free key from https://console.groq.com/keys (chat and question generation) |
| `LLM_API_KEY` | Free Gemini key from https://aistudio.google.com/apikey (embeddings) |
| `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` | `gemini` / `gemini-embedding-001` / `768` |
| `SMTP_USER` / `SMTP_PASSWORD` | Gmail address and a 16-character Gmail **App Password** (Google Account → Security → 2-Step Verification → App passwords). Leave `SMTP_USER` empty to print verification links in the backend log instead of emailing them. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional, for "Sign in with Google". Leave empty to hide the button. |

> Inside Docker the backend reaches the database at `db:5432` automatically, so the `localhost:5433` address in `DATABASE_URL` is only used in development mode.

---

## 4. Get the data

### Option A: copy it from a laptop that already runs PrepMind (recommended)

> Run these in **PowerShell** or **Command Prompt**. Git Bash on Windows rewrites `/tmp/...`
> into a Windows path and the commands fail; there, first run `export MSYS_NO_PATHCONV=1`.

**On the old laptop**, export the database to one file (about 26 MB):

```bash
docker exec prepmind-db pg_dump -U postgres -d prepmind -Fc -f /tmp/prepmind.dump
docker cp prepmind-db:/tmp/prepmind.dump ./prepmind.dump
```

Copy `prepmind.dump` and the whole `backend/data/knowledge_base/` folder to the new laptop by USB drive or Google Drive.

> `prepmind.dump` contains every user's account and progress. Never upload it to GitHub (`.gitignore` already blocks `*.dump`).

**On the new laptop:**

1. Put the PDFs back in `backend/data/knowledge_base/` with the same folder layout (`books/`, `formulas/`, `previous_year_questions/`).
2. Start the database and load the export:

   ```bash
   docker compose up -d db
   docker cp prepmind.dump prepmind-db:/tmp/prepmind.dump
   docker exec prepmind-db pg_restore -U postgres -d prepmind --clean --if-exists --no-owner /tmp/prepmind.dump
   ```

3. Check that the embeddings arrived (expect about 6,000 chunks):

   ```bash
   docker exec prepmind-db psql -U postgres -d prepmind -c "select count(*) from document_chunks"
   ```

Nothing needs re-embedding. The database records each PDF by its path inside `knowledge_base/` and a fingerprint of the file, so ingestion later recognises all of them as already done.

### Option B: build the data from scratch

1. Put the PDFs in `backend/data/knowledge_base/`:

   ```
   knowledge_base/
     books/<subject>/<class folder>/*.pdf        NCERT chapters (Physics, Chemistry, Mathematics)
     formulas/*.pdf                              formula sheets
     previous_year_questions/*.pdf               JEE Main papers with answer keys
   ```

2. Start everything (section 5), then embed the PDFs:

   ```bash
   docker compose exec backend python -m backend.services.pdf_ingestion
   ```

   The free Gemini tier allows about **1,000 embeddings a day**, and the full set is about 6,000, so this takes **about 6 days**. When the quota runs out the command stops cleanly; run it again the next day and it continues where it stopped. The quota resets at midnight Pacific time (1:30 PM IST).

3. Optional: fill the question bank ahead of time so the first exams start instantly:

   ```bash
   docker compose exec backend python -m backend.services.question_bank --exams 2
   ```

   Without this, the first exam generates its questions while the student waits (several minutes on the free Groq tier).

> ⚠️ **Never run the ingestion command while the PDFs are missing.** It deletes the embeddings of every PDF it cannot find, which would wipe the knowledge base.

---

## 5. Run PrepMind with Docker

```bash
docker compose up -d --build     # first time, and after code changes
```

Open **http://localhost:5173**. API docs: http://localhost:8000/docs.

| Task | Command |
|---|---|
| Start | `docker compose up -d` |
| Stop (data is kept) | `docker compose down` |
| See what's running | `docker compose ps` |
| Backend logs | `docker compose logs -f backend` |
| Apply an edited `backend/.env` | `docker compose up -d --force-recreate backend` |

> Never use `docker compose down -v`: `-v` deletes the database volume and all data.

## 6. Development mode (optional, for editing code)

Development mode reloads the code as you save it. It runs the database in Docker and the backend and frontend directly on your machine.

One-time setup:

```powershell
python -m venv myvenv
.\myvenv\Scripts\python.exe -m pip install -r backend\requirements.txt
cd frontend; npm install; cd ..
```

Then start it (Windows PowerShell):

```powershell
.\start-dev.ps1
```

This stops the Docker backend and frontend, because both modes use ports 8000 and 5173, and opens two windows with live logs. To go back to Docker mode, close those two windows and run `docker compose up -d`.

Run the backend tests (they use a temporary in-memory database and never send email or call the AI APIs):

```powershell
$env:PYTHONPATH="."; .\myvenv\Scripts\python.exe -m pytest backend\tests
```

---

## 7. Check that it works

1. Open http://localhost:5173, sign up and click the link in the verification email (or in `docker compose logs backend` if email is off).
2. **Tutor:** ask *"Explain Le Chatelier's principle"*. The answer should cite sources such as *Equilibrium · page 18*.
3. **Exam Simulator:** start a mock test; the 75-question paper appears once it is prepared.
4. **Daily 20:** today's set of 20 questions loads.

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| `failed to connect to the docker API` | Docker Desktop isn't running. Start it and wait for "Engine running". |
| `Set POSTGRES_PASSWORD in PrepMind/.env` | `PrepMind/.env` is missing (step 3). |
| Port 5173 or 8000 already in use | Development-mode windows are still open, or another app uses the port. Close them. |
| Chat says *"textbook search is temporarily unavailable"* | The Gemini key's daily quota is used up, or the key is wrong. Wait for the reset (1:30 PM IST) or use another key, then run `docker compose up -d --force-recreate backend`. |
| Answers have no textbook sources | The database has no embeddings. Do step 4. |
| Exam says questions can't be generated | The bank is empty and Groq's quota is used up, or the PDFs are missing. Fill the bank (Option B, step 3) or try later. |
| Verification email never arrives | Check `SMTP_USER` / `SMTP_PASSWORD` (it must be an App Password), or read the link from `docker compose logs backend`. |
| *"Too many failed login attempts"* | 5 wrong passwords in 15 minutes. Wait, or restart the backend to clear the counter. |
