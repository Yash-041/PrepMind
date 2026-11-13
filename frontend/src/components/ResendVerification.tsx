import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

const COOLDOWN_SECONDS = 60;

export function ResendVerification({ email, startCoolingDown = false }: { email: string; startCoolingDown?: boolean }) {
  const [cooldown, setCooldown] = useState(startCoolingDown ? COOLDOWN_SECONDS : 0);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const resend = async () => {
    setSending(true);
    setStatus(null);
    try {
      await api.resendVerification(email);
      setStatus({ tone: "ok", text: "A new verification link is on its way." });
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setStatus({ tone: "error", text: err instanceof ApiError ? err.message : "Couldn't reach the server. Try again." });
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <Button type="button" variant="outline" className="h-11 w-full gap-2" disabled={sending || cooldown > 0 || !email} onClick={resend} data-testid="resend-verification-button">
        <RefreshCw size={15} className={sending ? "animate-spin" : ""} />
        {cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend verification email"}
      </Button>
      {status && <p className={`mt-2 text-center text-xs ${status.tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`} role="status" data-testid="resend-verification-status">{status.text}</p>}
    </div>
  );
}
