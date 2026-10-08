import { useState } from "react";
import { Check, Clipboard, ThumbsDown, ThumbsUp, UserRound } from "lucide-react";
import type { Message } from "@/lib/types";

export function ChatMessage({ message }: { message: Message }) {
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
      <div className={`max-w-[min(720px,88%)] ${isUser ? "order-first" : ""}`}>
        <div className={`rounded-2xl px-4 py-3.5 text-[14px] leading-7 ${isUser ? "rounded-br-md bg-indigo-600 text-white" : "rounded-tl-md bg-white text-slate-700 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800"}`}>
          <div className="whitespace-pre-wrap" data-testid={`chat-message-content-${message.id}`}>{message.content}</div>
        </div>
        {!isUser && <div className="mt-2 flex items-center gap-1"><button onClick={copyMessage} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Copy response" data-testid={`chat-copy-${message.id}`}>{copied ? <Check size={14} /> : <Clipboard size={14} />}</button><button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Like response" data-testid={`chat-like-${message.id}`}><ThumbsUp size={14} /></button><button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Dislike response" data-testid={`chat-dislike-${message.id}`}><ThumbsDown size={14} /></button></div>}
      </div>
      {isUser && <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><UserRound size={16} /></div>}
    </article>
  );
}