import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { BrainCircuit, ChevronLeft, ChevronRight, FileText, History, LayoutDashboard, LoaderCircle, MessageSquarePlus, Moon, Settings, Sun, Target, Trash2, UserRound, X } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { Chat } from "@/lib/types";

interface SidebarProps {
  chats: Chat[];
  collapsed: boolean;
  mobileOpen: boolean;
  dark: boolean;
  onToggle: () => void;
  onMobileClose: () => void;
  onNewChat: () => void;
  onThemeToggle: () => void;
}

const navItems = [
  { to: "/", label: "AI Chatbot", icon: BrainCircuit },
  { to: "/daily", label: "Daily 20 Questions", icon: Target },
  { to: "/exam", label: "Exam Simulator", icon: FileText },
];

export function Sidebar({ chats, collapsed, mobileOpen, dark, onToggle, onMobileClose, onNewChat, onThemeToggle }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [chatSearch, setChatSearch] = useState("");
  const filteredChats = chats.filter((chat) => chat.title.toLowerCase().includes(chatSearch.toLowerCase()));
  const openChatId = new URLSearchParams(location.search).get("chat");
  const [pendingDelete, setPendingDelete] = useState<Chat | null>(null);

  const deleteChat = useMutation({
    mutationFn: (chat: Chat) => api.deleteChat(chat.id),
    onSuccess: (_, chat) => {
      queryClient.setQueryData<Chat[]>(["chats"], (old) => old?.filter((c) => c.id !== chat.id));
      queryClient.removeQueries({ queryKey: ["chat", chat.id] });
      if (openChatId === chat.id) navigate("/");
      setPendingDelete(null);
    },
  });

  return (
    <>
      {mobileOpen && <button className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden" onClick={onMobileClose} aria-label="Close navigation" data-testid="mobile-sidebar-backdrop" />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200/80 bg-slate-50/95 transition-[width,transform] duration-200 dark:border-slate-800 dark:bg-slate-950/95 lg:static lg:z-auto lg:translate-x-0 ${collapsed ? "w-[76px]" : "w-[274px]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`} data-testid="app-sidebar">
        <div className={`flex h-[72px] items-center border-b border-slate-200/80 px-5 dark:border-slate-800 ${collapsed ? "justify-center px-2" : "justify-between"}`}>
          <BrandMark compact={collapsed} />
          {!collapsed && <button onClick={onMobileClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 lg:hidden" aria-label="Close sidebar" data-testid="sidebar-close-button"><X size={18} /></button>}
          {!collapsed && <button onClick={onToggle} className="hidden rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 lg:block dark:hover:bg-slate-800" aria-label="Collapse sidebar" data-testid="sidebar-collapse-button"><ChevronLeft size={18} /></button>}
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto px-3 py-4">
          {collapsed && <button onClick={onToggle} className="mb-4 flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900" aria-label="Expand sidebar" data-testid="sidebar-expand-button"><ChevronRight size={18} /></button>}
          <button onClick={() => { onNewChat(); onMobileClose(); }} className={`mb-6 flex h-11 items-center gap-3 rounded-xl bg-indigo-600 px-3.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 hover:bg-indigo-700 active:scale-[.98] ${collapsed ? "justify-center px-0" : ""}`} data-testid="sidebar-new-chat-button">
            <MessageSquarePlus size={18} /> {!collapsed && "New chat"}
          </button>

          {!collapsed && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400" data-testid="sidebar-core-label">Core tools</p>}
          <nav className="space-y-1" aria-label="Core features">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={onMobileClose} className={({ isActive }) => `group flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition-colors ${isActive ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" : "text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"} ${collapsed ? "justify-center px-0" : ""}`} data-testid={`sidebar-nav-${label.toLowerCase().replaceAll(" ", "-")}`}>
                <Icon size={18} strokeWidth={location.pathname === to ? 2.2 : 1.8} /> {!collapsed && <span>{label}</span>}
              </NavLink>
            ))}
          </nav>

          {!collapsed && <div className="mt-7 flex items-center justify-between px-3"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400" data-testid="recent-chats-label">Recent chats</p><History size={14} className="text-slate-400" /></div>}
          {!collapsed && <div className="mt-2 px-1"><div className="relative mb-1"><input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search chats" className="h-8 w-full rounded-lg border border-transparent bg-white px-3 text-xs outline-none placeholder:text-slate-400 focus:border-indigo-300 dark:bg-slate-900" data-testid="sidebar-chat-search-input" /></div>{filteredChats.slice(0, 5).map((chat) => (
            <div key={chat.id} className={`group flex items-center rounded-lg ${openChatId === chat.id ? "bg-white dark:bg-slate-900" : "hover:bg-white dark:hover:bg-slate-900"}`}>
              <button onClick={() => { navigate(`/?chat=${chat.id}`); onMobileClose(); }} className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-xs ${openChatId === chat.id ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-500 group-hover:text-slate-800 dark:group-hover:text-slate-200"}`} data-testid={`recent-chat-${chat.id}`}>{chat.title}</button>
              {/* Always visible on touch screens; on desktop it appears on hover or keyboard focus. */}
              <button onClick={() => { deleteChat.reset(); setPendingDelete(chat); }} className="mr-1 shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 dark:hover:bg-rose-500/10" aria-label={`Delete chat "${chat.title}"`} data-testid={`recent-chat-delete-${chat.id}`}><Trash2 size={13} /></button>
            </div>
          ))}{filteredChats.length === 0 && <p className="px-3 py-2 text-xs text-slate-400" data-testid="recent-chats-empty">No conversations yet</p>}</div>}
        </div>

        <div className="space-y-1 border-t border-slate-200/80 p-3 dark:border-slate-800">
          <NavLink to="/progress" onClick={onMobileClose} className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-900 ${collapsed ? "justify-center px-0" : ""}`} data-testid="sidebar-nav-progress"><LayoutDashboard size={18} />{!collapsed && "Progress"}</NavLink>
          <NavLink to="/profile" onClick={onMobileClose} className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-900 ${collapsed ? "justify-center px-0" : ""}`} data-testid="sidebar-nav-profile"><UserRound size={18} />{!collapsed && "Profile"}</NavLink>
          <NavLink to="/settings" onClick={onMobileClose} className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-900 ${collapsed ? "justify-center px-0" : ""}`} data-testid="sidebar-nav-settings"><Settings size={18} />{!collapsed && "Settings"}</NavLink>
          <button onClick={onThemeToggle} className={`flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-semibold text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-900 ${collapsed ? "justify-center px-0" : ""}`} data-testid="theme-toggle-button">{dark ? <Sun size={18} /> : <Moon size={18} />}{!collapsed && (dark ? "Light mode" : "Dark mode")}</button>
        </div>
      </aside>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open && !deleteChat.isPending) setPendingDelete(null); }}>
        <DialogContent showCloseButton={false} data-testid="delete-chat-dialog">
          <DialogHeader>
            <DialogTitle>Delete chat?</DialogTitle>
            <DialogDescription>This chat and all its messages will be permanently deleted. This can't be undone.</DialogDescription>
          </DialogHeader>
          <p className="truncate rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200" title={pendingDelete?.title} data-testid="delete-chat-name">{pendingDelete?.title}</p>
          {deleteChat.isError && <p className="text-xs text-rose-600" role="alert">{deleteChat.error.message}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleteChat.isPending} data-testid="delete-chat-cancel">Cancel</Button>
            <Button onClick={() => pendingDelete && deleteChat.mutate(pendingDelete)} disabled={deleteChat.isPending} className="gap-2 bg-rose-600 text-white hover:bg-rose-700" data-testid="delete-chat-confirm">
              {deleteChat.isPending && <LoaderCircle size={14} className="animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}