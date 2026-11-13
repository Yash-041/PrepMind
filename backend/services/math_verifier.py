"""
Isolated SymPy Mathematical Verification Service.
Never uses Python eval(). Safely parses algebraic/numerical expressions
with restricted character sets and strict complexity bounds.
"""
import re
import sympy as sp
from sympy.parsing.sympy_parser import (
    parse_expr,
    standard_transformations,
    implicit_multiplication_application,
    convert_xor,
)

ALLOWED_CHARS_RE = re.compile(r"^[0-9a-zA-Z_\+\-\*\/\^\(\)\.\,\s\=]+$")
MAX_EXPR_LENGTH = 150

SAFE_LOCALS = {
    "pi": sp.pi,
    "e": sp.E,
    "sqrt": sp.sqrt,
    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,
    "log": sp.log,
    "ln": sp.log,
    "exp": sp.exp,
    "x": sp.Symbol("x", real=True),
    "y": sp.Symbol("y", real=True),
    "z": sp.Symbol("z", real=True),
    "t": sp.Symbol("t", real=True),
    "n": sp.Symbol("n", integer=True),
    "g": sp.Symbol("g", positive=True),
    "m": sp.Symbol("m", positive=True),
    "v": sp.Symbol("v", real=True),
    "u": sp.Symbol("u", real=True),
    "a": sp.Symbol("a", real=True),
    "R": sp.Symbol("R", positive=True),
}

TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)


def _clean_input(expr_str: str) -> str:
    if not isinstance(expr_str, str):
        raise ValueError("Expression must be a string.")
    cleaned = expr_str.strip()
    if not cleaned or len(cleaned) > MAX_EXPR_LENGTH:
        raise ValueError("Expression length is invalid or exceeds safety limit.")
    if "__" in cleaned or "import" in cleaned or "lambda" in cleaned or "eval" in cleaned:
        raise ValueError("Disallowed token in mathematical expression.")
    if not ALLOWED_CHARS_RE.match(cleaned):
        raise ValueError("Expression contains unsupported characters.")
    # "." is only for decimals; "x.attr" would reach Python attributes of SymPy objects.
    if re.search(r"\.\s*[A-Za-z_]", cleaned):
        raise ValueError("Attribute access is not allowed in mathematical expressions.")
    return cleaned


# parse_expr turns "2" into Integer(2), "0.4" into Float('0.4') and unknown names into
# Symbol('k'), so those constructors must be reachable; Python builtins stay hidden.
SAFE_GLOBALS = {
    "__builtins__": {},
    "Integer": sp.Integer,
    "Float": sp.Float,
    "Rational": sp.Rational,
    "Symbol": sp.Symbol,
}


def safe_parse(expr_str: str) -> sp.Expr:
    cleaned = _clean_input(expr_str)
    return parse_expr(
        cleaned,
        local_dict=SAFE_LOCALS,
        global_dict=dict(SAFE_GLOBALS),
        transformations=TRANSFORMATIONS,
        evaluate=True,
    )


def are_expressions_equivalent(
    expr_a: str, expr_b: str, tolerance: float = 1e-3
) -> bool:
    """
    Safely compares two mathematical or numerical strings for equivalence.
    Returns False conservatively if expressions contain unsupported units/text.
    """
    if expr_a.strip() == expr_b.strip():
        return True
    try:
        parsed_a = safe_parse(expr_a)
        parsed_b = safe_parse(expr_b)

        if parsed_a.is_number and parsed_b.is_number:
            val_a = float(parsed_a.evalf())
            val_b = float(parsed_b.evalf())
            # Relative: an absolute 1e-3 would call 0.0001 and 0.0009 equal.
            return abs(val_a - val_b) <= tolerance * max(abs(val_a), abs(val_b), 1e-12)

        # nsimplify: 0.4 (Float) and 2/5 (Rational) must cancel exactly.
        diff = sp.simplify(sp.nsimplify(parsed_a - parsed_b, rational=True))
        return diff == 0
    except Exception:
        return False
