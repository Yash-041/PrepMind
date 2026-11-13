/**
 * Clean up model-written Markdown + LaTeX before rendering (chat answers, questions,
 * options, explanations).
 */
export function normalizeMath(text: string): string {
  // remark-math only understands $ and $$; some models write \( \) and \[ \].
  const dollars = text
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`);
  return normalizeDisplayMath(dollars);
}

/** KaTeX options shared by every renderer: macros models invent that KaTeX lacks. */
export const katexOptions = {
  macros: { "\\Rs": "\\text{₹}", "\\rupee": "\\text{₹}", "\\Rupee": "\\text{₹}", "\\INR": "\\text{₹}" },
};

const MATH = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g;
const RUPEE = /\\(?:Rs|rupee|Rupee|INR|rupees)(?![A-Za-z])\s*/g;
const BRACED = String.raw`(?:[^{}]|\{[^{}]*\})*`;
const TEXT_WITH_SCRIPT = new RegExp(String.raw`\\text\{(${BRACED}[\^_]${BRACED})\}`, "g");

// Real LaTeX commands starting with \n; any other "\n..." is a newline the model escaped twice.
const N_COMMANDS = new Set([
  "nabla", "natural", "ne", "nearrow", "neg", "neq", "newline", "nexists", "ngeq", "ngtr", "ni",
  "nleftarrow", "nLeftarrow", "nleftrightarrow", "nLeftrightarrow", "nleq", "nless", "nmid",
  "nolimits", "not", "notin", "nparallel", "nprec", "nrightarrow", "nRightarrow", "nsim",
  "nsubseteq", "nsucc", "nsupseteq", "nu", "nwarrow", "ncong", "normalsize",
]);
const LITERAL_N = /(?<!\\)\\(n[A-Za-z]*)/g;
const ENVIRONMENT = /\\begin\{([a-z]+\*?)\}[\s\S]*?\\end\{\1\}/g;

function mapOutsideMath(text: string, fn: (segment: string) => string): string {
  let out = "";
  let pos = 0;
  for (const m of text.matchAll(MATH)) {
    out += fn(text.slice(pos, m.index)) + m[0];
    pos = m.index! + m[0].length;
  }
  return out + fn(text.slice(pos));
}

/** Split on whitespace outside braces and not escaped ("\ "), keeping the separators. */
function latexTokens(segment: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (ch === "\\" && i + 1 < segment.length) {
      cur += segment.slice(i, i + 2);
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
      out.push(ch);
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** Put $…$ around words outside maths that contain LaTeX commands or ^{ / _{. */
function wrapBareLatex(segment: string): string {
  return latexTokens(segment)
    .map((tok) => {
      if (/^\s+$/.test(tok) || !(/\\[A-Za-z]+/.test(tok) || /[\^_]\{/.test(tok))) return tok;
      const lead = tok.match(/^\(*/)![0];
      let core = tok.slice(lead.length);
      let trail = "";
      while (core && ".,;:!?)".includes(core[core.length - 1]) && !core.endsWith("\\" + core[core.length - 1])) {
        if (core.endsWith(")") && (core.match(/\(/g)?.length ?? 0) >= (core.match(/\)/g)?.length ?? 0)) break;
        trail = core[core.length - 1] + trail;
        core = core.slice(0, -1);
      }
      return core ? `${lead}$${core}$${trail}` : tok;
    })
    .join("");
}

/**
 * Repair generated question text the renderer can't show: LaTeX outside $…$ (e.g. a bare
 * \ce{NaOH}), ^ or _ inside \text{…}, and \Rs. Same rules as backend/services/question_text.py,
 * so questions saved before that fix display correctly too. Not used for chat answers,
 * which may contain code with backslashes.
 */
export function repairQuestionLatex(text: string): string {
  if (!text || !text.includes("\\")) return text;
  text = text
    .replace(LITERAL_N, (m, word: string) => (N_COMMANDS.has(word) ? m : "\n" + word.slice(1)))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`)
    .replace(/\\\(((?:(?!\\\()[\s\S])+?)\\\)/g, (_, m) => `$${m}$`)
    // A \( the model never closed ends at its sentence or line.
    .replace(/\\\(([^\n]*?)(?=\.\s+[A-Z]|\.?[ \t]*(?:\n|$))/g, (_, m) => `$${m}$`);
  text = mapOutsideMath(text, (seg) => seg.replace(ENVIRONMENT, (env) => `\n$$\n${env.trim()}\n$$\n`));
  // Inside maths \Rs is handled by the KaTeX macro; outside it becomes the ₹ sign.
  text = mapOutsideMath(text, (seg) => wrapBareLatex(seg.replace(RUPEE, "₹")));
  return text.replace(TEXT_WITH_SCRIPT, (_m, body) => `\\mathrm{${body}}`);
}

/**
 * remark-math only renders $$…$$ as a display block when each $$ sits on a line of its
 * own. Models often write it otherwise, and each variant breaks differently:
 *   "$$ x = 1 $$"         on one line       -> rendered as small inline maths
 *   "$$ x = 1\n$$"        formula on opener  -> taken as a label and dropped
 *   "$$\nx = 1 $$"        formula on closer  -> block never closes, rest of the reply
 *                                              shows as raw maths
 * So every $$…$$ that starts its line is rewritten with the fences on their own lines,
 * keeping the line's indentation (equations inside list items).
 *
 * A multi-line $$…$$ that opens mid-line, usually inside a table cell
 * ("| Molar mass | $$\nM = 44.01\n$$ | … |"), would end the table row instead, so it
 * becomes one-line inline maths. A one-line $$…$$ inside a sentence stays inline.
 */
function normalizeDisplayMath(text: string): string {
  let out = "";
  let i = 0;
  for (;;) {
    const open = text.indexOf("$$", i);
    if (open === -1) break;
    const close = text.indexOf("$$", open + 2);
    if (close === -1) break; // still streaming, or unbalanced: leave the rest as it is
    const lineStart = text.lastIndexOf("\n", open - 1) + 1;
    const indent = text.slice(lineStart, open);
    const body = text.slice(open + 2, close);
    out += text.slice(i, open);
    i = close + 2;

    if (indent.trim() !== "") {
      out += body.includes("\n") ? `$${body.replace(/\s*\n\s*/g, " ").trim()}$` : text.slice(open, i);
      continue;
    }

    const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      out += text.slice(open, i);
      continue;
    }
    // Text after the closing $$ on the same line: punctuation joins the equation,
    // anything else moves to the next line so the fence stays alone on its line.
    const lineEnd = text.indexOf("\n", i);
    const trailing = text.slice(i, lineEnd === -1 ? text.length : lineEnd);
    let after = "";
    if (/^\s*[.,;:]\s*$/.test(trailing)) {
      lines[lines.length - 1] += trailing.trim();
      i += trailing.length;
    } else if (trailing.trim()) {
      after = `\n${indent}`;
      i += trailing.length - trailing.trimStart().length;
    }
    out += `$$\n${lines.map((line) => indent + line).join("\n")}\n${indent}$$${after}`;
  }
  return out + text.slice(i);
}
