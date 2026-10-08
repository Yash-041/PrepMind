import { useRef, useState } from "react";
import { ImagePlus, Mic, Paperclip, Send, Square, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatInputProps {
  disabled?: boolean;
  isGenerating?: boolean;
  onSend: (message: string) => void;
  onStop?: () => void;
}

export function ChatInput({ disabled, isGenerating, onSend, onStop }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = () => { if (value.trim() && !disabled) { onSend(value.trim()); setValue(""); } };
  return (
    <div className="mx-auto w-full max-w-3xl" data-testid="chat-input-region">
      {attachment && <div className="mb-2 flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300" data-testid="chat-attachment-preview"><ImagePlus size={14} /><span className="truncate">{attachment}</span><button onClick={() => setAttachment(null)} className="ml-auto rounded p-1 hover:bg-indigo-100" aria-label="Remove attachment" data-testid="remove-attachment-button"><X size={14} /></button></div>}
      <div className="rounded-2xl border border-slate-300 bg-white p-2 shadow-lg shadow-slate-200/30 transition-[border-color,box-shadow] focus-within:border-indigo-400 focus-within:shadow-indigo-100/40 dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
        <Textarea value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder="Ask PrepMind AI anything..." className="min-h-[52px] resize-none border-0 bg-transparent px-3 py-2 text-sm leading-6 shadow-none focus-visible:ring-0" disabled={disabled || isGenerating} data-testid="chat-message-input" />
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1"><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => setAttachment(event.target.files?.[0]?.name ?? null)} data-testid="chat-image-upload-input" /><button onClick={() => fileRef.current?.click()} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800" aria-label="Attach a question image" data-testid="chat-attach-button"><Paperclip size={17} /></button><button onClick={() => fileRef.current?.click()} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800" aria-label="Upload image" data-testid="chat-image-button"><ImagePlus size={17} /></button><button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800" aria-label="Voice input" data-testid="chat-voice-button"><Mic size={17} /></button><div className="hidden items-center gap-1 border-l border-slate-200 pl-2 sm:flex dark:border-slate-700"><button onClick={() => setValue("Solve this JEE problem step by step: ")} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800" data-testid="chat-quick-solve-button">Solve</button><button onClick={() => setValue("Explain this concept from the basics: ")} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800" data-testid="chat-quick-explain-button">Explain</button><button onClick={() => setValue("Give me a JEE practice set on ")} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800" data-testid="chat-quick-practice-button">Practice</button></div></div>
          {isGenerating ? <Button type="button" variant="outline" size="sm" onClick={onStop} className="gap-2" data-testid="chat-stop-generating-button"><Square size={13} fill="currentColor" /> Stop</Button> : <Button type="button" size="icon" disabled={!value.trim() || disabled} onClick={submit} className="size-9 rounded-xl bg-indigo-600 hover:bg-indigo-700" aria-label="Send message" data-testid="chat-send-button"><Send size={16} /></Button>}
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] text-slate-400" data-testid="chat-input-hint"><WandSparkles size={11} className="mr-1 inline" />PrepMind AI uses a demo tutor in Phase 1 · Enter to send, Shift + Enter for a new line</p>
    </div>
  );
}