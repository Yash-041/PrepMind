"""
LangGraph Stateful RAG Tutor Workflow.

    condense_question -> retrieve_context -> assess_context
        -> generate_grounded_answer | generate_general_answer -> validate_answer

1. condense_question  -> Rewrites follow-ups ("why is it 2/5?") into a standalone
                         search query using recent chat history.
2. retrieve_context   -> pgvector cosine search over ingested book/formula/PYQ chunks.
3. assess_context     -> Routes on whether the best match clears the similarity bar.
4. generate_*         -> Gemini answer grounded in numbered excerpts, or a general
                         answer that states the knowledge base had no match.
5. validate_answer    -> Keeps only sources the answer actually cites ([1], [2]...).
"""
import logging
import re
from typing import Iterator, List, Optional, Tuple, TypedDict

from langgraph.graph import StateGraph, END
from sqlalchemy import and_, not_, or_
from sqlalchemy.orm import Session

from backend.lib.config import settings
from backend.models.knowledge import DocumentChunk, Document
from backend.services.embeddings import active_embedding_model, embed_query
from backend.services.llm import content_text, get_chat_model, model_available

logger = logging.getLogger(__name__)

# Hash-based mock vectors score far lower than real embeddings, so they need their own bar.
MOCK_MIN_SIMILARITY = 0.15
SUBJECT_MATCH_BONUS = 0.03

# Textbook answer keys are lists of exercise numbers and bare results. They score well
# against number-heavy questions but explain nothing, so the tutor never cites them.
# (PYQ papers keep their keys: "Paper with Answer Keys" is part of the paper.)
TRUNCATION_NOTE = (
    "\n\n---\n\n*This answer reached the maximum length and was cut off. "
    "Reply **continue** to get the rest.*"
)


def _close_open_math(answer: str) -> str:
    """A reply cut mid-equation leaves a $$ open, which would swallow the note as maths."""
    return "\n$$" if answer.count("$$") % 2 else ""


def _hit_length_limit(metadata: Optional[dict]) -> bool:
    """Groq reports finish_reason "length", Gemini "MAX_TOKENS"."""
    reason = str((metadata or {}).get("finish_reason", "")).lower()
    return reason in ("length", "max_tokens")


_NOT_ANSWER_KEY = not_(
    and_(
        Document.doc_type == "book",
        or_(Document.filename.ilike("%answer%"), Document.filename.ilike("le___an.pdf")),
    )
)


class TutorGraphState(TypedDict):
    question: str
    history: List[dict]
    search_query: str
    detected_subject: Optional[str]
    retrieved_chunks: List[dict]
    context_sufficient: bool
    answer: str
    sources: List[dict]
    is_fallback: bool
    service_error: bool
    model: str


SUBJECT_KEYWORDS = {
    "Physics": [
        "force", "velocity", "acceleration", "moment of inertia", "rolling",
        "projectile", "electric", "resistor", "carnot", "bohr", "lens", "torque",
        "optics", "momentum", "gravitation", "magnetic", "wave", "friction",
    ],
    "Chemistry": [
        "acid", "pka", "electron", "quantum number", "faraday", "mno4",
        "half-life", "first-order", "coordination", "oxidation", "enthalpy",
        "entropy", "benzene", "hybridization", "hybridisation", "sn1", "sn2",
        "mole", "equilibrium", "orbital", "reaction",
    ],
    "Mathematics": [
        "derivative", "integral", "quadratic", "roots", "matrix", "determinant",
        "circle", "parabola", "ellipse", "permutation", "combination",
        "complex number", "probability", "limit", "vector", "sequence", "calculus",
    ],
}

SYSTEM_PROMPT = (
    "You are PrepMind AI, a rigorous and friendly JEE Main & Advanced tutor for "
    "Physics, Chemistry, and Mathematics.\n"
    "- Explain step by step, the way a good teacher would, and finish with the key "
    "formula or takeaway.\n"
    "- Write maths in LaTeX: $...$ inline and $$...$$ for display equations. Use Markdown "
    "headings and lists where they help.\n"
    "- Write chemical formulas and reactions with mhchem: $\\ce{CO2}$, "
    "$\\ce{N2(g) + 3H2(g) <=> 2NH3(g)}$. Write units upright, e.g. $\\mathrm{g\\,mol^{-1}}$.\n"
    "- Keep each display equation short. Split a long chain of steps over several lines with "
    "$$\\begin{aligned} a &= b \\\\ &= c \\end{aligned}$$ instead of one very wide line.\n"
    "- In tables, keep every row on a single line and use only inline $...$ maths in cells; "
    "never put $$...$$ or a line break inside a table. Put longer equations below the table.\n"
    "- When excerpts from the knowledge base are provided, base your answer on them and "
    "cite each fact you take from them with its number in plain square brackets, e.g. [1] "
    "or [2][3] (never 【1】 or [1†...]). Put citations "
    "in the prose at the end of a sentence, never inside $...$ or $$...$$. Never cite a "
    "number that was not provided, and never invent book titles, page numbers, or PYQ years.\n"
    "- If the student asks something outside JEE preparation, briefly steer them back."
)


def detect_subject(query: str) -> Optional[str]:
    q_lower = query.lower()
    scores = {
        subj: sum(1 for kw in kws if kw in q_lower)
        for subj, kws in SUBJECT_KEYWORDS.items()
    }
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else None


def _history_messages(history: List[dict]) -> List[tuple]:
    role_map = {"user": "human", "assistant": "ai"}
    return [(role_map[m["role"]], m["content"]) for m in history if m["role"] in role_map]


def _min_similarity() -> float:
    if active_embedding_model().startswith("gemini:"):
        return settings.RAG_MIN_SIMILARITY
    return MOCK_MIN_SIMILARITY


def _answer_messages(state: TutorGraphState) -> List[tuple]:
    """Chat messages for the answer step: grounded in numbered excerpts, or a general answer."""
    chunks = state["retrieved_chunks"]
    if state["context_sufficient"]:
        context_block = "\n\n".join(
            f"[{i}] {c['source_file']} | {c['chapter']} | page {c['page_number']}\n{c['content']}"
            for i, c in enumerate(chunks, start=1)
        )
        user_prompt = f"Knowledge base excerpts:\n{context_block}\n\nStudent question: {state['question']}"
    else:
        reason = (
            "The PrepMind textbook search is temporarily unavailable, so no excerpts "
            "could be retrieved for this question. "
            if state["service_error"]
            else "No matching excerpt was found in the PrepMind knowledge base for this question. "
        )
        user_prompt = (
            reason
            + "Start your reply with one short sentence saying so, then answer from your own "
            "JEE knowledge without any [n] citations.\n\n"
            f"Student question: {state['question']}"
        )
    return [("system", SYSTEM_PROMPT), *_history_messages(state["history"]), ("human", user_prompt)]


def _fallback_answer(state: TutorGraphState) -> str:
    """Shown when the chat model is unavailable (no key, quota, outage)."""
    if state["context_sufficient"]:
        top = state["retrieved_chunks"][0]
        footer = (
            "The AI tutor is temporarily unavailable (API limit reached), so this is the raw "
            "textbook excerpt. Please try again later for a full explanation."
            if model_available(state["model"])
            else "Configure `LLM_PROVIDER` and its API key for full step-by-step explanations."
        )
        return (
            "**[Fallback — Closest Textbook Excerpt]**\n\n"
            f"The closest match is from **{top['source_file']}** "
            f"(*{top['chapter']}*, page {top['page_number']}) [1]:\n\n"
            f"> {top['content']}\n\n" + footer
        )
    if state["service_error"] or model_available(state["model"]):
        return (
            "**The AI tutor is temporarily unavailable.**\n\n"
            "The AI service's usage limit has been reached. Please try your question again later."
        )
    return (
        "**[Demo Fallback Mode — No Matching Knowledge Base Document Found]**\n\n"
        f"The knowledge base has no excerpt matching: *\"{state['question']}\"*.\n\n"
        "Add the relevant chapter PDFs to `backend/data/knowledge_base/` and run the "
        "ingestion script to enable grounded answers."
    )


# gpt-oss models were trained to cite as 【3】 or 【3†L5-L9】 (full-width brackets), and
# sometimes do so despite the prompt; those become [3] so the citation is recognised.
_ALT_CITATION = re.compile(r"【\s*(\d{1,2})\s*(?:†[^】]*)?】|\[(\d{1,2})†[^\]]*\]")


def normalize_citations(answer: str) -> str:
    return _ALT_CITATION.sub(lambda m: f"[{m.group(1) or m.group(2)}]", answer)


def finalize_answer(state: TutorGraphState) -> TutorGraphState:
    """Keep only sources the answer cites ([1], [2]...) and drop citations to excerpts never provided."""
    chunks = state["retrieved_chunks"]
    state = {**state, "answer": normalize_citations(state["answer"])}
    if not state["context_sufficient"]:
        return {**state, "sources": []}

    cited = {int(n) for n in re.findall(r"\[(\d+)\]", state["answer"])}
    valid = sorted(n for n in cited if 1 <= n <= len(chunks))
    sources = [
        {
            "ref": n,
            "source_file": chunks[n - 1]["source_file"],
            "doc_type": chunks[n - 1]["doc_type"],
            "subject": chunks[n - 1]["subject"],
            "chapter": chunks[n - 1]["chapter"],
            "page_number": chunks[n - 1]["page_number"],
            "excerpt": chunks[n - 1]["content"][:280],
            "similarity": chunks[n - 1]["similarity"],
        }
        for n in valid
    ]
    answer = re.sub(
        r"\[(\d+)\]",
        lambda m: m.group(0) if 1 <= int(m.group(1)) <= len(chunks) else "",
        state["answer"],
    )
    return {**state, "answer": answer, "sources": sources}


def _build_graph(db: Session, include_generation: bool):
    def condense_question(state: TutorGraphState) -> TutorGraphState:
        question = state["question"]
        if not state["history"] or not model_available(state["model"]):
            return {**state, "search_query": question}
        prompt = (
            "Rewrite the student's latest message as a standalone search query for a "
            "JEE textbook, resolving pronouns and references using the conversation. "
            "Reply with the query only.\n\n"
            + "\n".join(f"{m['role']}: {m['content'][:500]}" for m in state["history"])
            + f"\nuser: {question}"
        )
        try:
            rewritten = content_text(get_chat_model(state["model"], temperature=0).invoke(prompt).content)
        except Exception:
            logger.exception("Question condensing failed; searching with the raw question.")
            rewritten = ""
        return {**state, "search_query": rewritten or question}

    def retrieve_context(state: TutorGraphState) -> TutorGraphState:
        query = state["search_query"]
        subject = detect_subject(query)
        try:
            q_emb = embed_query(query)
        except Exception:
            # Embedding API down or out of quota: answer without retrieval instead of a 500.
            logger.exception("Query embedding failed; skipping retrieval.")
            return {**state, "detected_subject": subject, "retrieved_chunks": [], "service_error": True}

        distance = DocumentChunk.embedding.cosine_distance(q_emb).label("distance")
        rows = (
            db.query(DocumentChunk, Document, distance)
            .join(Document, DocumentChunk.document_id == Document.id)
            .filter(Document.embedding_model == active_embedding_model(), _NOT_ANSWER_KEY)
            .order_by(distance)
            .limit(settings.RAG_TOP_K * 2)
            .all()
        )

        scored = []
        for chunk, doc, dist in rows:
            similarity = 1.0 - float(dist)
            rank_score = similarity + (SUBJECT_MATCH_BONUS if subject and chunk.subject == subject else 0.0)
            scored.append(
                {
                    "chunk_id": chunk.id,
                    "content": chunk.content,
                    "subject": chunk.subject,
                    "chapter": chunk.chapter or "General",
                    "page_number": chunk.page_number,
                    "source_file": doc.filename,
                    "doc_type": doc.doc_type,
                    "similarity": round(similarity, 4),
                    "rank_score": rank_score,
                }
            )
        scored.sort(key=lambda c: c["rank_score"], reverse=True)
        relevant = [c for c in scored if c["similarity"] >= _min_similarity()]
        return {
            **state,
            "detected_subject": subject,
            "retrieved_chunks": relevant[: settings.RAG_TOP_K],
        }

    def assess_context(state: TutorGraphState) -> TutorGraphState:
        return {**state, "context_sufficient": bool(state["retrieved_chunks"])}

    def route_after_assessment(state: TutorGraphState) -> str:
        return "grounded" if state["context_sufficient"] else "general"

    def generate_answer(state: TutorGraphState) -> TutorGraphState:
        if model_available(state["model"]):
            try:
                resp = get_chat_model(state["model"]).invoke(_answer_messages(state))
                answer = content_text(resp.content)
                if _hit_length_limit(resp.response_metadata):
                    answer += _close_open_math(answer) + TRUNCATION_NOTE
                return {**state, "answer": answer, "is_fallback": False}
            except Exception:
                logger.exception("LLM call failed; using fallback answer.")
        return {**state, "answer": _fallback_answer(state), "is_fallback": True}

    workflow = StateGraph(TutorGraphState)
    workflow.add_node("condense_question", condense_question)
    workflow.add_node("retrieve_context", retrieve_context)
    workflow.add_node("assess_context", assess_context)
    workflow.set_entry_point("condense_question")
    workflow.add_edge("condense_question", "retrieve_context")
    workflow.add_edge("retrieve_context", "assess_context")

    if not include_generation:
        # Streaming path: stream_rag_tutor generates the answer itself after these steps.
        workflow.add_edge("assess_context", END)
        return workflow.compile()

    workflow.add_node("generate_grounded_answer", generate_answer)
    workflow.add_node("generate_general_answer", generate_answer)
    workflow.add_node("validate_answer", finalize_answer)
    workflow.add_conditional_edges(
        "assess_context",
        route_after_assessment,
        {"grounded": "generate_grounded_answer", "general": "generate_general_answer"},
    )
    workflow.add_edge("generate_grounded_answer", "validate_answer")
    workflow.add_edge("generate_general_answer", "validate_answer")
    workflow.add_edge("validate_answer", END)
    return workflow.compile()


def build_rag_tutor_graph(db: Session):
    return _build_graph(db, include_generation=True)


def _initial_state(question: str, history: List[dict], model: str) -> TutorGraphState:
    return {
        "question": question,
        "history": history[-6:],
        "search_query": question,
        "detected_subject": None,
        "retrieved_chunks": [],
        "context_sufficient": False,
        "answer": "",
        "sources": [],
        "is_fallback": False,
        "service_error": False,
        "model": model,
    }


def run_rag_tutor(db: Session, question: str, history: List[dict], model: str) -> dict:
    return build_rag_tutor_graph(db).invoke(_initial_state(question, history, model))


def stream_rag_tutor(
    db: Session, question: str, history: List[dict], model: str
) -> Iterator[Tuple[str, object]]:
    """
    Streaming variant: runs condense -> retrieve -> assess through LangGraph, then
    yields ("context", state), ("token", text)..., and finally ("done", final_state).
    """
    state = _build_graph(db, include_generation=False).invoke(_initial_state(question, history, model))
    yield "context", state

    parts: List[str] = []
    streamed_ok = False
    cut_off = False
    if model_available(model):
        try:
            for chunk in get_chat_model(model).stream(_answer_messages(state)):
                text = chunk.content if isinstance(chunk.content, str) else content_text(chunk.content)
                if text:
                    parts.append(text)
                    yield "token", text
                cut_off = cut_off or _hit_length_limit(chunk.response_metadata)
            streamed_ok = True
        except Exception:
            logger.exception("LLM stream failed; using fallback answer.")

    if parts:
        # A stream that broke midway keeps what the student already saw.
        answer, is_fallback = content_text("".join(parts)), False
        if cut_off:
            ending = _close_open_math(answer) + TRUNCATION_NOTE
            answer += ending
            yield "token", ending
    else:
        answer, is_fallback = _fallback_answer(state), not streamed_ok
        yield "token", answer
    yield "done", finalize_answer({**state, "answer": answer, "is_fallback": is_fallback})
