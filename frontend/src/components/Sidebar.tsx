import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, BrainCircuit, ChevronLeft, ChevronRight, CircleHelp, FileText, History, LayoutDashboard, Menu, MessageSquarePlus, Moon, PanelLeft, Settings, Sparkles, Sun, Target, UserRound, X } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
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
          {!collapsed && <div className="mt-2 px-1"><div className="relative mb-1"><input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search chats" className="h-8 w-full rounded-lg border border-transparent bg-white px-3 text-xs outline-none placeholder:text-slate-400 focus:border-indigo-300 dark:bg-slate-900" data-testid="sidebar-chat-search-input" /></div>{filteredChats.slice(0, 5).map((chat) => <button key={chat.id} onClick={() => { navigate(`/?chat=${chat.id}`); onMobileClose(); }} className="block w-full truncate rounded-lg px-3 py-2 text-left text-xs text-slate-500 hover:bg-white hover:text-slate-800 dark:hover:bg-slate-900 dark:hover:text-slate-200" data-testid={`recent-chat-${chat.id}`}>{chat.title}</button>)}{filteredChats.length === 0 && <p className="px-3 py-2 text-xs text-slate-400" data-testid="recent-chats-empty">No conversations yet</p>}</div>}
        </div>

        <div className="space-y-1 border-t border-slate-200/80 p-3 dark:border-slate-800">
          <NavLink to="/progress" onClick={onMobileClose} className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-900 ${collapsed ? "justify-center px-0" : ""}`} data-testid="sidebar-nav-progress"><LayoutDashboard size={18} />{!collapsed && "Progress"}</NavLink>
          <NavLink to="/profile" onClick={onMobileClose} className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-900 ${collapsed ? "justify-center px-0" : ""}`} data-testid="sidebar-nav-profile"><UserRound size={18} />{!collapsed && "Profile"}</NavLink>
          <NavLink to="/settings" onClick={onMobileClose} className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-900 ${collapsed ? "justify-center px-0" : ""}`} data-testid="sidebar-nav-settings"><Settings size={18} />{!collapsed && "Settings"}</NavLink>
          <button onClick={onThemeToggle} className={`flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-semibold text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-900 ${collapsed ? "justify-center px-0" : ""}`} data-testid="theme-toggle-button">{dark ? <Sun size={18} /> : <Moon size={18} />}{!collapsed && (dark ? "Light mode" : "Dark mode")}</button>
        </div>
      </aside>
    </>
  );
}