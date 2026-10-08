import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Menu, PanelLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import type { Chat } from "@/lib/types";
import { getDemoProfile, profileInitials } from "@/lib/demoAuth";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem("prepmind-theme") === "dark");
  const [profileName, setProfileName] = useState(() => getDemoProfile().name);
  const chatsQuery = useQuery({ queryKey: ["chats"], queryFn: () => apiGet<Chat[]>("/chats"), retry: false });
  const createChat = useMutation({ mutationFn: () => apiPost<Chat>("/chats", {}), onSuccess: (chat) => { queryClient.invalidateQueries({ queryKey: ["chats"] }); navigate(`/?chat=${chat.id}`); } });

  useEffect(() => { document.documentElement.classList.toggle("dark", dark); localStorage.setItem("prepmind-theme", dark ? "dark" : "light"); }, [dark]);
  useEffect(() => {
    const syncProfile = () => setProfileName(getDemoProfile().name);
    window.addEventListener("prepmind-profile-updated", syncProfile);
    return () => window.removeEventListener("prepmind-profile-updated", syncProfile);
  }, []);
  return (
    <div className="flex min-h-svh bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100" data-testid="app-shell">
      <Sidebar chats={chatsQuery.data ?? []} collapsed={collapsed} mobileOpen={mobileOpen} dark={dark} onToggle={() => setCollapsed((value) => !value)} onMobileClose={() => setMobileOpen(false)} onNewChat={() => createChat.mutate()} onThemeToggle={() => setDark((value) => !value)} />
      <main className="flex min-w-0 flex-1 flex-col" data-testid="main-content">
        <header className="flex h-[72px] shrink-0 items-center justify-end border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-xl sm:px-6 dark:border-slate-800 dark:bg-slate-950/85">
          <div className="flex items-center gap-2"><button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-900" aria-label="Open navigation" data-testid="mobile-menu-button"><Menu size={18} /></button><Button variant="ghost" size="icon-sm" onClick={() => setDark((value) => !value)} aria-label="Toggle theme" data-testid="header-theme-toggle"><PanelLeft size={16} className="hidden sm:block text-slate-400" /><span className="text-xs text-slate-500 sm:hidden">{dark ? "Light" : "Dark"}</span></Button><button onClick={() => navigate("/profile")} className="flex size-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 transition-[background-color,transform,box-shadow] hover:bg-indigo-200 hover:shadow-sm active:scale-95 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25" aria-label={`Open ${profileName}'s profile`} data-testid="header-profile-avatar">{profileInitials(profileName)}</button></div>
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </main>
    </div>
  );
}