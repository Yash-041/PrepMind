"""
Textbook chapters in the knowledge base, as source material for generated questions.

Question generation only needs the book text, not embeddings, so it reads the chapter
PDFs directly. That way every subject on disk can be used, even before its PDFs are
embedded for the chatbot. Chapter names come from the NCERT syllabus table below so the
same chapter always gets the same name, which is what weak-topic tracking keys on.
"""
import json
import logging
import random
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from pypdf import PdfReader

from backend.services.pdf_ingestion import KNOWLEDGE_BASE_DIR, chunk_text, infer_metadata_from_path, looks_garbled

logging.getLogger("pypdf").setLevel(logging.ERROR)

SUBJECTS = ("Physics", "Chemistry", "Mathematics")

# Current (rationalised) NCERT chapter lists: (subject, class) -> titles in chapter order.
NCERT_CHAPTERS: Dict[Tuple[str, str], List[str]] = {
    ("Physics", "Class 11"): [
        "Units and Measurement", "Motion in a Straight Line", "Motion in a Plane", "Laws of Motion",
        "Work, Energy and Power", "System of Particles and Rotational Motion", "Gravitation",
        "Mechanical Properties of Solids", "Mechanical Properties of Fluids",
        "Thermal Properties of Matter", "Thermodynamics", "Kinetic Theory", "Oscillations", "Waves",
    ],
    ("Physics", "Class 12"): [
        "Electric Charges and Fields", "Electrostatic Potential and Capacitance", "Current Electricity",
        "Moving Charges and Magnetism", "Magnetism and Matter", "Electromagnetic Induction",
        "Alternating Current", "Electromagnetic Waves", "Ray Optics and Optical Instruments",
        "Wave Optics", "Dual Nature of Radiation and Matter", "Atoms", "Nuclei",
        "Semiconductor Electronics",
    ],
    ("Chemistry", "Class 11"): [
        "Some Basic Concepts of Chemistry", "Structure of Atom",
        "Classification of Elements and Periodicity in Properties",
        "Chemical Bonding and Molecular Structure", "Thermodynamics", "Equilibrium",
        "Redox Reactions", "Organic Chemistry: Some Basic Principles and Techniques", "Hydrocarbons",
    ],
    ("Chemistry", "Class 12"): [
        "Solutions", "Electrochemistry", "Chemical Kinetics", "The d- and f-Block Elements",
        "Coordination Compounds", "Haloalkanes and Haloarenes", "Alcohols, Phenols and Ethers",
        "Aldehydes, Ketones and Carboxylic Acids", "Amines", "Biomolecules",
    ],
    ("Mathematics", "Class 11"): [
        "Sets", "Relations and Functions", "Trigonometric Functions",
        "Complex Numbers and Quadratic Equations", "Linear Inequalities",
        "Permutations and Combinations", "Binomial Theorem", "Sequences and Series",
        "Straight Lines", "Conic Sections", "Introduction to Three Dimensional Geometry",
        "Limits and Derivatives", "Statistics", "Probability",
    ],
    ("Mathematics", "Class 12"): [
        "Relations and Functions", "Inverse Trigonometric Functions", "Matrices", "Determinants",
        "Continuity and Differentiability", "Application of Derivatives", "Integrals",
        "Application of Integrals", "Differential Equations", "Vector Algebra",
        "Three Dimensional Geometry", "Linear Programming", "Probability",
    ],
}

# Answer keys, appendices and supplements aren't chapters to write questions from.
_NOT_A_CHAPTER = re.compile(r"answer|appendi|key|supplement|lech\d(a\d|an)", re.IGNORECASE)
PASSAGE_WINDOW = 3  # consecutive chunks (~3,000 characters) given to the generator
# Extracting a chapter takes a few seconds, so extracted text is kept on disk.
CACHE_DIR = KNOWLEDGE_BASE_DIR.parent / "cache" / "passages"


@dataclass(frozen=True)
class Chapter:
    subject: str
    student_class: str
    number: int
    title: str
    path: Path

    @property
    def source_label(self) -> str:
        return f"NCERT {self.student_class} {self.subject}, Ch. {self.number}: {self.title}"


def _chapter_number(pdf_path: Path) -> Optional[int]:
    stem = pdf_path.stem.lower()
    ncert = re.fullmatch(r"le[a-z]{2}(\d)(\d{2})", stem)  # lech101 = part 1, chapter 1
    if ncert:
        part, num = int(ncert.group(1)), int(ncert.group(2))
        return num if part == 1 else 5 + num  # NCERT Class 12 Part II starts at chapter 6
    match = re.search(r"chapter\s*(\d+)", stem)
    return int(match.group(1)) if match else None


@lru_cache(maxsize=1)
def list_chapters() -> Tuple[Chapter, ...]:
    """Every chapter PDF under knowledge_base/books with its NCERT title."""
    chapters: List[Chapter] = []
    books_dir = KNOWLEDGE_BASE_DIR / "books"
    for pdf_path in sorted(books_dir.rglob("*.pdf")):
        if _NOT_A_CHAPTER.search(pdf_path.name):
            continue
        meta = infer_metadata_from_path(pdf_path, KNOWLEDGE_BASE_DIR)
        number = _chapter_number(pdf_path)
        titles = NCERT_CHAPTERS.get((meta["subject"], meta["student_class"] or ""))
        if not titles or not number or number > len(titles):
            continue
        chapters.append(Chapter(meta["subject"], meta["student_class"], number, titles[number - 1], pdf_path))
    return tuple(chapters)


def chapters_for(subject: str) -> List[Chapter]:
    return [c for c in list_chapters() if c.subject == subject]


def find_chapter(subject: str, title: str) -> Optional[Chapter]:
    return next((c for c in chapters_for(subject) if c.title == title), None)


@lru_cache(maxsize=128)
def chapter_passages(chapter: Chapter) -> Tuple[Tuple[int, str], ...]:
    """(page, text) chunks of a chapter, without pages whose text layer is broken."""
    stat = chapter.path.stat()
    stamp = f"{stat.st_size}:{int(stat.st_mtime)}"
    cache_file = CACHE_DIR / f"{chapter.subject}-{chapter.student_class}-{chapter.number}.json".replace(" ", "_")
    try:
        cached = json.loads(cache_file.read_text(encoding="utf-8"))
        if cached.get("stamp") == stamp:
            return tuple((page, text) for page, text in cached["passages"])
    except (OSError, ValueError, KeyError):
        pass

    passages = _extract_passages(chapter.path)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps({"stamp": stamp, "passages": passages}), encoding="utf-8")
    return tuple(passages)


def _extract_passages(pdf_path: Path) -> list:
    try:
        reader = PdfReader(str(pdf_path))
    except Exception:
        return []
    passages: List[Tuple[int, str]] = []
    for page_idx, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
        except Exception:
            continue
        passages.extend((page_idx + 1, piece) for piece in chunk_text(text) if not looks_garbled(piece))
    # A chapter with almost no text (a scanned PDF) can't ground questions.
    return passages if sum(len(t) for _, t in passages) > 3000 else []


def sample_passage(chapter: Chapter, rng: random.Random) -> Tuple[str, int]:
    """A random window of consecutive chunks from the chapter, and its first page."""
    passages = chapter_passages(chapter)
    if not passages:
        raise ValueError(f"No readable text in {chapter.source_label}")
    start = rng.randrange(max(1, len(passages) - PASSAGE_WINDOW + 1))
    window = passages[start:start + PASSAGE_WINDOW]
    text = "\n\n".join(f"[page {page}] {piece}" for page, piece in window)
    return text, window[0][0]
