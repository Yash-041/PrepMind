"""
Clean-up and checks for generated question text (question, options, explanation).

The question models sometimes write LaTeX the frontend (remark-math + KaTeX) can't show:
  - commands outside $...$:        using 1\\ \\text{atm}=101.3\\ \\text{J}   -> raw backslashes
  - \\ce{...} without delimiters:   \\ce{NaOH}                              -> raw text
  - ^ or _ inside \\text{...}:      \\text{J\\,L^{-1}}                       -> KaTeX error
  - made-up macros:               $\\Rs 250$                               -> KaTeX error
repair_latex() fixes these; text_problems() reports what still can't be shown or makes the
question depend on another one ("for the same problem..."), so the draft is dropped.
The frontend applies the same repair when rendering (frontend/src/lib/markdown.ts).
"""
import re
from typing import List

_MATH = re.compile(r"\$\$[\s\S]+?\$\$|\$[^$\n]+?\$")
_RUPEE = re.compile(r"\\(?:Rs|rupee|Rupee|INR|rupees)(?![A-Za-z])\s*")
_COMMAND = re.compile(r"\\[A-Za-z]+")
_BRACED = r"(?:[^{}]|\{[^{}]*\})*"
_TEXT_WITH_SCRIPT = re.compile(r"\\text\{(" + _BRACED + r"[\^_]" + _BRACED + r")\}")
_TRAILING = ".,;:!?)"

# A question must stand alone: in an exam or Daily 20 it is shown on its own.
CROSS_REFERENCE = re.compile(
    r"\b(same|previous|preceding|earlier|prior|last|above) (problem|question)s?\b"
    r"|\b(same|previous|preceding|earlier|prior) (situation|scenario|set-?up|data|configuration)\b"
    r"|\bquestion \d|\bq\.? ?\d+\b",
    re.IGNORECASE,
)


def _split_math(text: str):
    """Yield (is_math, segment) pieces in order."""
    pos = 0
    for m in _MATH.finditer(text):
        if m.start() > pos:
            yield False, text[pos:m.start()]
        yield True, m.group(0)
        pos = m.end()
    if pos < len(text):
        yield False, text[pos:]


def _tokens(segment: str) -> List[str]:
    """Split on whitespace outside braces and not escaped (\\ ), keeping the separators."""
    out, cur, depth, i = [], "", 0, 0
    while i < len(segment):
        ch = segment[i]
        if ch == "\\" and i + 1 < len(segment):
            cur += segment[i:i + 2]
            i += 2
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth = max(0, depth - 1)
        if ch.isspace() and depth == 0:
            if cur:
                out.append(cur)
                cur = ""
            out.append(ch)
        else:
            cur += ch
        i += 1
    if cur:
        out.append(cur)
    return out


def _wrap_bare_latex(segment: str) -> str:
    """Put $...$ around words outside maths that contain LaTeX commands or ^{ / _{ ."""
    pieces = []
    for tok in _tokens(segment):
        if tok.isspace() or not (_COMMAND.search(tok) or re.search(r"[\^_]\{", tok)):
            pieces.append(tok)
            continue
        lead = re.match(r"^\(*", tok).group(0)
        core = tok[len(lead):]
        trail = ""
        while core and core[-1] in _TRAILING and not core.endswith("\\" + core[-1]):
            # keep a ) that closes a ( inside the token
            if core[-1] == ")" and core.count("(") >= core.count(")"):
                break
            trail = core[-1] + trail
            core = core[:-1]
        pieces.append(f"{lead}${core}${trail}" if core else tok)
    return "".join(pieces)


# Real LaTeX commands starting with \n; any other "\n..." is a newline the model escaped twice.
_N_COMMANDS = {
    "nabla", "natural", "ne", "nearrow", "neg", "neq", "newline", "nexists", "ngeq", "ngtr", "ni",
    "nleftarrow", "nLeftarrow", "nleftrightarrow", "nLeftrightarrow", "nleq", "nless", "nmid",
    "nolimits", "not", "notin", "nparallel", "nprec", "nrightarrow", "nRightarrow", "nsim",
    "nsubseteq", "nsucc", "nsupseteq", "nu", "nwarrow", "ncong", "normalsize",
}
_LITERAL_N = re.compile(r"(?<!\\)\\(n[A-Za-z]*)")
_ENVIRONMENT = re.compile(r"\\begin\{([a-z]+\*?)\}[\s\S]*?\\end\{\1\}")


def _fix_literal_newlines(text: str) -> str:
    return _LITERAL_N.sub(lambda m: m.group(0) if m.group(1) in _N_COMMANDS else "\n" + m.group(1)[1:], text)


def repair_latex(text: str) -> str:
    if not text or "\\" not in text:
        return text
    text = _fix_literal_newlines(text)
    # \( \) and \[ \] -> $ / $$ (remark-math knows only dollars).
    text = re.sub(r"\\\[(.+?)\\\]", r"$$\1$$", text, flags=re.DOTALL)
    text = re.sub(r"\\\(((?:(?!\\\().)+?)\\\)", r"$\1$", text, flags=re.DOTALL)
    # A \( the model never closed ends at its sentence or line.
    text = re.sub(r"\\\(([^\n]*?)(?=\.\s+[A-Z]|\.?[ \t]*(?:\n|$))", r"$\1$", text)
    # \begin{aligned}...\end{aligned} written outside maths becomes a display block.
    text = "".join(
        seg if is_math else _ENVIRONMENT.sub(lambda m: f"\n$$\n{m.group(0).strip()}\n$$\n", seg)
        for is_math, seg in _split_math(text)
    )
    parts = []
    for is_math, seg in _split_math(text):
        if is_math:
            seg = _RUPEE.sub(r"\\text{₹}", seg)
        else:
            seg = _RUPEE.sub("₹", seg)
            seg = _wrap_bare_latex(seg)
        parts.append(seg)
    text = "".join(parts)
    # \text{J\,L^{-1}}: scripts aren't allowed in text mode, \mathrm shows the same thing.
    return _TEXT_WITH_SCRIPT.sub(r"\\mathrm{\1}", text)


def text_problems(text: str, standalone: bool = True) -> List[str]:
    """Reasons this text can't be shown as a question; empty when it's fine."""
    problems = []
    outside = "".join(seg for is_math, seg in _split_math(text) if not is_math)
    if outside.count("$") % 2:
        problems.append("unbalanced $")
    elif _COMMAND.search(outside.replace("\\$", "")):
        problems.append("LaTeX outside maths")
    if standalone and CROSS_REFERENCE.search(text):
        problems.append("refers to another question")
    return problems
