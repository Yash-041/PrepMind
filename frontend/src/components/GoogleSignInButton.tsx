import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

// Minimal typing for the Google Identity Services script (https://accounts.google.com/gsi/client).
type CredentialResponse = { credential: string };
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (res: CredentialResponse) => void; ux_mode?: "popup" | "redirect" }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Couldn't load Google sign-in.")));
  });
}

export function GoogleSignInButton({ text = "continue_with", redirectTo = "/" }: { text?: "signin_with" | "signup_with" | "continue_with"; redirectTo?: string }) {
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !container.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          ux_mode: "popup",
          callback: async ({ credential }) => {
            setBusy(true);
            setError("");
            try {
              await api.googleLogin(credential);
              queryClient.clear();
              navigate(redirectTo, { replace: true });
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Google sign-in failed. Please try again.");
            } finally {
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(container.current, {
          theme: document.documentElement.classList.contains("dark") ? "filled_black" : "outline",
          size: "large",
          shape: "pill",
          text,
          width: container.current.offsetWidth || 320,
        });
      })
      .catch((err: Error) => setError(err.message));
    return () => { cancelled = true; };
  }, [navigate, redirectTo, text]);

  // Hidden entirely until a Google OAuth client ID is configured.
  if (!CLIENT_ID) return null;

  return (
    <div data-testid="google-signin">
      <div className="my-5 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />or<span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" /></div>
      <div ref={container} className={`flex min-h-11 w-full justify-center ${busy ? "pointer-events-none opacity-60" : ""}`} />
      {error && <p className="mt-2 text-center text-xs text-rose-600 dark:text-rose-400" role="alert" data-testid="google-signin-error">{error}</p>}
    </div>
  );
}
