"""
PDF Discovery, Text Extraction, Chunking, and Embedding Pipeline.

Folder layout (subject comes from a sub-folder or the filename):
    data/knowledge_base/books/physics/hc_verma_vol1.pdf
    data/knowledge_base/formulas/chemistry_formula_sheet.pdf
    data/knowledge_base/previous_year_questions/jee_main/maths_2023.pdf

CLI:
    python -m backend.services.pdf_ingestion            # ingest new/changed PDFs
    python -m backend.services.pdf_ingestion --force    # re-embed everything
"""
import argparse
import hashlib
import logging
import re
from pathlib import Path
from typing import List, Optional, Tuple

from pypdf import PdfReader
from sqlalchemy.orm import Session

from backend.lib.db import SessionLocal, init_db
from backend.models.knowledge import Document, DocumentChunk
from backend.services.embeddings import active_embedding_model, embed_documents

# pypdf warns on every odd font in NCERT PDFs; extraction still works.
logging.getLogger("pypdf").setLevel(logging.ERROR)

KNOWLEDGE_BASE_DIR =Path(__file__).resolve().parent.parent / "data" / "knowledge_base"
CHUNK_SIZE = 1200
CHUNK_OVERLAP = 200
MIN_CHUNK_CHARS = 40

DOC_TYPE_FOLDERS = {"books": "book", "formulas": "formula", "previous_year_questions": "pyq"}
SUBJECT_ALIASES = {
    "physics": "Physics",
    "chemistry": "Chemistry",
    "mathematics": "Mathematics",
    "maths": "Mathematics",
    "math": "Mathematics",
}


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split on sentence boundaries where possible so formulas aren't cut mid-way."""
    # Some PDFs extract with NUL bytes, which PostgreSQL text columns reject.
    cleaned = " ".join(text.replace("\x00", " ").split())
    if len(cleaned) <= chunk_size:
        return [cleaned] if len(cleaned) >= MIN_CHUNK_CHARS else []

    chunks: List[str] = []
    start = 0
    while start < len(cleaned):
        end = min(len(cleaned), start + chunk_size)
        if end < len(cleaned):
            boundary = cleaned.rfind(". ", start, end)
            if boundary > start + chunk_size // 2:
                end = boundary + 1
        piece = cleaned[start:end].strip()
        if len(piece) >= MIN_CHUNK_CHARS:
            chunks.append(piece)
        if end >= len(cleaned):
            break
        start = max(start + 1, end - overlap)
    return chunks


def infer_metadata_from_path(pdf_path: Path, base_dir: Path) -> dict:
    rel_parts = [p.lower() for p in pdf_path.relative_to(base_dir).parts]
    rel_text = " ".join(rel_parts).replace("_", " ").replace("-", " ")
    name_tokens = set(re.split(r"[^a-z]+", pdf_path.stem.lower()))

    subject = "General"
    for key, value in SUBJECT_ALIASES.items():
        if key in rel_parts[:-1] or key in name_tokens:
            subject = value
            break

    doc_type = next((DOC_TYPE_FOLDERS[p] for p in rel_parts if p in DOC_TYPE_FOLDERS), "book")

    exam = "JEE Main & Advanced"
    if "jee main" in rel_text:
        exam = "JEE Main"
    elif "jee advanced" in rel_text:
        exam = "JEE Advanced"

    class_match = re.search(r"class (11|12)", rel_text)
    student_class = f"Class {class_match.group(1)}" if class_match else None

    stem = re.sub(r"previous year paper.*$", "", pdf_path.stem, flags=re.IGNORECASE)
    chapter = re.sub(r"[_\-]+", " ", stem).strip()
    if chapter.islower():
        chapter = chapter.title()
    return {
        "subject": subject,
        "doc_type": doc_type,
        "exam": exam,
        "student_class": student_class,
        "chapter": chapter[:120],
    }


def looks_garbled(text: str) -> bool:
    """Detect text from PDFs with broken font maps, e.g. 'eleFtroYalenFe' for 'electrovalence'."""
    # Only lowercase-initial words count: chemical formulas (NaCl, KMnO4) start uppercase.
    words = re.findall(r"\b[a-z][A-Za-z]{4,}\b", text)
    if len(words) < 10:
        return False
    # A broken font map mangles many different words; a repeated running header or
    # notation like nCk only produces one or two distinct ones.
    odd = [w for w in words if re.search(r"[a-z][A-Z][a-z]", w)]
    return len(set(odd)) >= 5 and len(odd) / len(words) > 0.08


def _extract_page_chunks(reader: PdfReader) -> Tuple[List[Tuple[int, str]], int]:
    page_chunks: List[Tuple[int, str]] = []
    garbled = 0
    for page_idx, page in enumerate(reader.pages):
        try:
            page_text = page.extract_text() or ""
        except Exception:
            continue
        for piece in chunk_text(page_text):
            if looks_garbled(piece):
                garbled += 1
            else:
                page_chunks.append((page_idx + 1, piece))
    return page_chunks, garbled


def infer_chapter_title(reader: PdfReader, fallback: str, subject: str) -> str:
    """Ask the LLM for the real chapter name; filenames like 'lech101' are useless in citations."""
    from backend.services.llm import content_text, get_chat_model, model_available

    if not model_available():
        return fallback
    opening = " ".join(
        (reader.pages[i].extract_text() or "") for i in range(min(2, len(reader.pages)))
    )
    opening = " ".join(opening.split())[:2500]
    if not opening:
        return fallback
    prompt = (
        f"Below is the opening text of a {subject} textbook PDF (an NCERT chapter, appendix, "
        "or answer key). Reply with only its title in Title Case, at most 8 words, e.g. "
        "'Moving Charges and Magnetism' or 'Answers to Exercises (Chapters 1-6)'. No quotes.\n\n"
        + opening
    )
    try:
        title = content_text(get_chat_model(temperature=0).invoke(prompt).content)
    except Exception:
        return fallback
    title = title.strip().strip("\"'*").splitlines()[0].strip() if title.strip() else ""
    return title[:120] if 2 < len(title) <= 120 else fallback


def ingest_pdf(db: Session, pdf_path: Path, base_dir: Path, force: bool = False) -> str:
    """Ingest one PDF. Returns "skipped", "no_text", or a summary like "ingested 42 chunks"."""
    file_bytes = pdf_path.read_bytes()
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    rel_path = pdf_path.relative_to(base_dir).as_posix()
    model_name = active_embedding_model()

    existing = db.query(Document).filter(Document.file_path == rel_path).first()
    if (
        existing
        and not force
        and existing.file_hash == file_hash
        and existing.embedding_model == model_name
    ):
        return "skipped"

    reader = PdfReader(str(pdf_path))
    page_chunks, garbled = _extract_page_chunks(reader)
    if not page_chunks:
        # Scanned/image-only PDFs have no text layer and need OCR first.
        return "no_text"

    meta = infer_metadata_from_path(pdf_path, base_dir)
    if meta["doc_type"] == "book":
        meta["chapter"] = infer_chapter_title(reader, meta["chapter"], meta["subject"])

    # Embed before touching the DB so an API failure leaves the old version intact.
    vectors = embed_documents([text for _, text in page_chunks])

    if existing:
        db.delete(existing)
        db.flush()

    doc = Document(
        filename=pdf_path.name,
        file_path=rel_path,
        file_hash=file_hash,
        subject=meta["subject"],
        doc_type=meta["doc_type"],
        exam=meta["exam"],
        student_class=meta["student_class"],
        embedding_model=model_name,
        page_count=len(reader.pages),
    )
    db.add(doc)
    db.flush()

    db.add_all(
        DocumentChunk(
            document_id=doc.id,
            chunk_index=idx,
            content=text,
            subject=meta["subject"],
            chapter=meta["chapter"],
            page_number=page_number,
            embedding=vector,
        )
        for idx, ((page_number, text), vector) in enumerate(zip(page_chunks, vectors))
    )
    db.commit()
    summary = f"ingested {len(page_chunks)} chunks as '{meta['chapter']}'"
    return summary + (f", skipped {garbled} garbled" if garbled else "")


def ingest_knowledge_base_directory(
    db: Session, base_dir: Optional[Path] = None, force: bool = False
) -> dict:
    base_dir = base_dir or KNOWLEDGE_BASE_DIR
    stats = {"scanned": 0, "ingested": 0, "skipped_unchanged": 0, "removed": 0, "no_text": [], "failed": []}
    if not base_dir.exists():
        return stats

    found_paths = set()
    for pdf_path in sorted(base_dir.rglob("*.pdf")):
        stats["scanned"] += 1
        found_paths.add(pdf_path.relative_to(base_dir).as_posix())
        label = f"[{stats['scanned']}] {pdf_path.relative_to(base_dir)}"
        try:
            outcome = ingest_pdf(db, pdf_path, base_dir, force=force)
        except Exception as exc:
            db.rollback()
            stats["failed"].append({"file": pdf_path.name, "error": str(exc)[:300]})
            print(f"{label}: FAILED {str(exc)[:200]}", flush=True)
            if "perday" in str(exc).lower():
                # Every remaining file would fail the same way; resume tomorrow.
                print("Daily embedding quota reached. Run this again tomorrow to continue.", flush=True)
                stats["stopped_on_daily_quota"] = True
                db.commit()
                return stats
            continue
        print(f"{label}: {outcome}", flush=True)
        if outcome == "skipped":
            stats["skipped_unchanged"] += 1
        elif outcome == "no_text":
            stats["no_text"].append(pdf_path.name)
        else:
            stats["ingested"] += 1

    # Drop documents whose PDF was deleted from the folder (seeded notes are kept).
    for doc in db.query(Document).filter(~Document.file_path.like("synthetic://%")).all():
        if doc.file_path not in found_paths:
            db.delete(doc)
            stats["removed"] += 1
    db.commit()
    return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest knowledge base PDFs into pgvector.")
    parser.add_argument("--force", action="store_true", help="Re-embed every PDF, even unchanged ones.")
    args = parser.parse_args()

    init_db()
    print(f"Embedding model: {active_embedding_model()}")
    with SessionLocal() as session:
        result = ingest_knowledge_base_directory(session, force=args.force)
    print(f"Knowledge Base Ingestion Complete: {result}")
    if result["no_text"]:
        print("No extractable text (scanned PDFs need OCR):", ", ".join(result["no_text"]))
