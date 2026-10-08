import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, BookOpen, Calculator, FlaskConical, Lightbulb, RefreshCw, Sparkles } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { Chat, ChatDetail, MessageResponse } from "@/lib/types";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessage } from "@/components/ChatMessage";
import { Button } from "@/components/ui/button";

const suggestions = [
  { title: "Explain a concept", prompt: "Explain rotational motion from basics.", icon: Lightbulb },
  { title: "Solve a problem", prompt: "Solve this JEE Advanced physics problem step by step.", icon: Calculator },
  { title: "Practice", prompt: "Give me 5 difficult calculus questions.", icon: BookOpen },
  { title: "Chemistry", prompt: "Explain the mechanism of SN1 and SN2 reactions.", icon: FlaskConical },
];

export default function Home() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const selectedFromUrl = new URLSearchParams(location.search).get("chat");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(() => localStorage.getItem("prepmind-chat-id"));
  const chatsQuery = useQuery({ queryKey: ["chats"], queryFn: () => apiGet<Chat[]>("/chats"), retry: false });
  const detailQuery = useQuery({ queryKey: ["chat", selectedChatId], queryFn: () => apiGet<ChatDetail>(`/chats/${selectedChatId}`), enabled: Boolean(selectedChatId), retry: false });
  const createChat = useMutation({ mutationFn: () => apiPost<Chat>("/chats", {}) });
  const sendMessage = useMutation({ mutationFn: ({ chatId, content }: { chatId: string; content: string }) => apiPost<MessageResponse>(`/chats/${chatId}/messages`, { content }), onSuccess: (_, variables) => { queryClient.invalidateQueries({ queryKey: ["chats"] }); queryClient.invalidateQueries({ queryKey: ["chat", variables.chatId] }); } });

  useEffect(() => {
    if (selectedFromUrl && selectedFromUrl !== selectedChatId) setSelectedChatId(selectedFromUrl);
  }, [selectedFromUrl, selectedChatId]);
  useEffect(() => {
    if (!selectedChatId && !selectedFromUrl && chatsQuery.data?.[0]) setSelectedChatId(chatsQuery.data[0].id);
  }, [chatsQuery.data, selectedChatId, selectedFromUrl]);
  useEffect(() => { if (selectedChatId) localStorage.setItem("prepmind-chat-id", selectedChatId); }, [selectedChatId]);

  const messages = detailQuery.data?.messages ?? [];
  const isBusy = createChat.isPending || sendMessage.isPending;
  const startAndSend = async (content: string) => {
    let chatId = selectedFromUrl ?? selectedChatId;
    if (!chatId) { const chat = await createChat.mutateAsync(); chatId = chat.id; setSelectedChatId(chatId); navigate(`/?chat=${chatId}`, { replace: true }); }
    await sendMessage.mutateAsync({ chatId, content });
  };
  const error = detailQuery.isError || sendMessage.isError || chatsQuery.isError;
  const empty = messages.length === 0;
  const currentChatTitle = useMemo(() => detailQuery.data?.chat.title ?? "New conversation", [detailQuery.data?.chat.title]);

  return (
    <div className="relative flex h-[calc(100svh-72px)] min-h-0 flex-col" data-testid="chat-page">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {empty ? <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-5 py-10 sm:px-8"><div className="mb-10 max-w-2xl"><div className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><Sparkles size={21} /></div><p className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-indigo-600 dark:text-indigo-400" data-testid="chat-kicker">Your JEE study companion</p><h1 className="font-heading text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl dark:text-white" data-testid="chat-welcome-heading">What do you want to learn today?</h1><p className="mt-4 max-w-lg text-base leading-7 text-slate-500 dark:text-slate-400" data-testid="chat-welcome-subtitle">Ask PrepMind AI anything about JEE preparation. Get clear explanations, solve harder problems, and build the consistency that compounds.</p></div><div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2" data-testid="chat-suggestions">{suggestions.map(({ title, prompt, icon: Icon }) => <button key={title} onClick={() => startAndSend(prompt)} className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/50" data-testid={`suggestion-${title.toLowerCase().replaceAll(" ", "-")}`}><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-indigo-500/15 dark:group-hover:text-indigo-300"><Icon size={17} /></span><span><span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{prompt}</span></span><ArrowUpRight size={15} className="ml-auto text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></button>)}</div></div> : <div className="mx-auto w-full max-w-3xl px-5 pb-8 pt-5 sm:px-8"><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600 dark:text-indigo-400" data-testid="active-chat-label">Active conversation</p><h1 className="mt-1 font-heading text-xl font-semibold tracking-tight" data-testid="active-chat-title">{currentChatTitle}</h1></div><Button variant="outline" size="sm" onClick={() => { setSelectedChatId(null); navigate("/"); }} className="gap-2" data-testid="new-chat-inline-button"><Sparkles size={14} /> New chat</Button></div>{messages.map((message) => <ChatMessage key={message.id} message={message} />)}{isBusy && <div className="flex items-center gap-3 py-5" data-testid="typing-indicator"><div className="flex size-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">P</div><div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-white px-4 py-4 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800"><span className="size-1.5 animate-pulse rounded-full bg-indigo-500" /><span className="size-1.5 animate-pulse rounded-full bg-indigo-500 [animation-delay:150ms]" /><span className="size-1.5 animate-pulse rounded-full bg-indigo-500 [animation-delay:300ms]" /><span className="ml-2 text-xs text-slate-400">PrepMind is thinking…</span></div></div>}{error && <div className="my-4 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300" data-testid="chat-error-state"><span>Something went wrong while loading this conversation.</span><button onClick={() => { detailQuery.refetch(); chatsQuery.refetch(); }} className="inline-flex items-center gap-1 font-semibold hover:underline" data-testid="chat-retry-button"><RefreshCw size={14} /> Try again</button></div>}</div>}
      </div>
      <div className="shrink-0 border-t border-slate-200/80 bg-slate-100/90 px-4 py-4 backdrop-blur-xl sm:px-8 dark:border-slate-800 dark:bg-slate-950/90"><ChatInput disabled={Boolean(detailQuery.isError)} isGenerating={isBusy} onSend={startAndSend} onStop={() => {}} /></div>
    </div>
  );
}