import { memo, useState } from "react";
import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
// Adds \ce{...} / \pu{...} for chemical equations (registers on the shared katex instance).
import "katex/contrib/mhchem";
// Selected maths copies as its LaTeX source instead of both KaTeX layers (MathML + HTML).
import "katex/contrib/copy-tex";
import { BookOpen, Check, ChevronDown, Clipboard, ThumbsDown, ThumbsUp, UserRound } from "lucide-react";
import { katexOptions, normalizeMath } from "@/lib/markdown";
import type { Message, Source } from "@/lib/types";

// Matches math ($$..$$, $..$) and code (```..```, `..`) so citations inside them are left alone.
const PROTECTED = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|```[\s\S]*?```|`[^`\n]*`)/g;

/** Turn [1] / [2][3] into markdown links the renderer shows as citation badges. */
function prepareMarkdown(content: string): string {
  // gpt-oss sometimes cites as 【3】 / 【3†L5-L9】; show those as normal [3] badges while streaming.
  return normalizeMath(content.replace(/【\s*(\d{1,2})\s*(?:†[^】]*)?】|\[(\d{1,2})†[^\]]*\]/g, (_m, a, b) => `[${a ?? b}]`))
    .split(PROTECTED)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\[(\d{1,2})\](?!\()/g, "[$1](#cite-$1)")))
    .join("");
}

const markdownComponents: ComponentProps<typeof ReactMarkdown>["components"] = {
  h1: (props) => <h3 className="mb-2 mt-5 font-heading text-lg font-semibold text-slate-900 first:mt-0 dark:text-white" {...props} />,
  h2: (props) => <h3 className="mb-2 mt-5 font-heading text-base font-semibold text-slate-900 first:mt-0 dark:text-white" {...props} />,
  h3: (props) => <h4 className="mb-1.5 mt-4 text-[15px] font-semibold text-slate-900 first:mt-0 dark:text-white" {...props} />,
  h4: (props) => <h4 className="mb-1 mt-3 font-semibold text-slate-900 first:mt-0 dark:text-white" {...props} />,
  p: (props) => <p className="my-2.5 first:mt-0 last:mb-0" {...props} />,
  ul: (props) => <ul className="my-2.5 list-disc space-y-1 pl-5 marker:text-indigo-400" {...props} />,
  ol: (props) => <ol className="my-2.5 list-decimal space-y-1 pl-5 marker:text-indigo-500" {...props} />,
  li: (props) => <li className="pl-1" {...props} />,
  strong: (props) => <strong className="font-semibold text-slate-900 dark:text-white" {...props} />,
  hr: () => <hr className="my-4 border-slate-200 dark:border-slate-800" />,
  blockquote: (props) => <blockquote className="my-3 border-l-2 border-indigo-300 pl-3 text-slate-600 dark:border-indigo-500/50 dark:text-slate-300" {...props} />,
  table: (props) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-left text-[13px]" {...props} /></div>,
  th: (props) => <th className="border-b border-slate-200 px-2 py-1.5 font-semibold dark:border-slate-700" {...props} />,
  td: (props) => <td className="border-b border-slate-100 px-2 py-1.5 align-top dark:border-slate-800" {...props} />,
  pre: (props) => <pre className="my-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-[13px] text-slate-100" {...props} />,
  code: ({ className, ...props }) => <code className={className ?? "rounded bg-slate-100 px-1 py-0.5 font-mono text-[13px] dark:bg-slate-800"} {...props} />,
  a: ({ href, children, ...props }) => {
    if (href?.startsWith("#cite-")) {
      return <a href={href} className="mx-0.5 inline-flex h-4 min-w-4 -translate-y-0.5 items-center justify-center rounded bg-indigo-100 px-1 text-[10px] font-bold text-indigo-700 no-underline hover:bg-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300" title={`Source ${children}`}>{children}</a>;
    }
    return <a href={href} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 underline underline-offset-2 dark:text-indigo-400" {...props}>{children}</a>;
  },
};

function Sources({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800" data-testid="chat-sources">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400" data-testid="chat-sources-toggle">
        <BookOpen size={13} /> {sources.length} textbook source{sources.length > 1 ? "s" : ""}
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {!open && <div className="mt-2 flex flex-wrap gap-1.5">{sources.map((s) => <span key={s.ref} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"><b className="text-indigo-600 dark:text-indigo-400">{s.ref}</b> {s.chapter} · p.{s.page_number}</span>)}</div>}
      {open && <ol className="mt-2 space-y-2">{sources.map((s) => (
        <li key={s.ref} id={`cite-${s.ref}`} className="rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-slate-950">
          <p className="font-semibold text-slate-700 dark:text-slate-200"><span className="text-indigo-600 dark:text-indigo-400">[{s.ref}]</span> {s.chapter} · page {s.page_number} <span className="font-normal text-slate-400">({s.subject}, {s.source_file})</span></p>
          <p className="mt-1 leading-5 text-slate-500 dark:text-slate-400">“{s.excerpt}…”</p>
        </li>
      ))}</ol>}
    </div>
  );
}

function ChatMessageImpl({ message, streaming = false }: { message: Message; streaming?: boolean }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const copyMessage = async () => {
    await navigator.clipboard?.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <article className={`flex gap-3 py-5 ${isUser ? "justify-end" : "justify-start"}`} data-testid={`chat-message-${message.id}`}>
      {!isUser && <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><span className="text-sm font-bold">P</span></div>}
      <div className={`min-w-0 max-w-[min(720px,88%)] ${isUser ? "order-first" : ""}`}>
        <div className={`rounded-2xl px-4 py-3.5 text-[14px] leading-7 ${isUser ? "rounded-br-md bg-indigo-600 text-white" : "rounded-tl-md bg-white text-slate-700 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800"}`}>
          {isUser
            ? <div className="whitespace-pre-wrap break-words" data-testid={`chat-message-content-${message.id}`}>{message.content}</div>
            : <div className="chat-markdown break-words" data-testid={`chat-message-content-${message.id}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, katexOptions]]} components={markdownComponents}>{prepareMarkdown(message.content)}</ReactMarkdown>
                {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-indigo-500 align-middle" aria-hidden />}
              </div>}
          {!isUser && !streaming && message.sources && message.sources.length > 0 && <Sources sources={message.sources} />}
        </div>
        {!isUser && !streaming && <div className="mt-2 flex items-center gap-1">
          <button onClick={copyMessage} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Copy response" data-testid={`chat-copy-${message.id}`}>{copied ? <Check size={14} /> : <Clipboard size={14} />}</button>
          <button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Like response" data-testid={`chat-like-${message.id}`}><ThumbsUp size={14} /></button>
          <button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Dislike response" data-testid={`chat-dislike-${message.id}`}><ThumbsDown size={14} /></button>
          {message.model && <span className="ml-1 text-[10px] text-slate-400" title="AI model that wrote this answer (testing info)" data-testid={`chat-model-${message.id}`}>Answered by {message.model.split(":").pop()}</span>}
        </div>}
      </div>
      {isUser && <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><UserRound size={16} /></div>}
    </article>
  );
}

// Past messages don't re-render (and re-run KaTeX) on every streamed token.
export const ChatMessage = memo(ChatMessageImpl);
