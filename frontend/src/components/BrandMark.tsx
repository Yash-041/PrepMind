const PREPMIND_LOGO = "https://customer-assets-m6fa6gv7.emergentagent.net/job_concept-solver-ai-1/artifacts/uba329tx_Gemini_Generated_Image_.png";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" data-testid="brand-mark">
      <img src={PREPMIND_LOGO} alt="PrepMind AI logo" className="size-9 rounded-xl bg-white object-contain p-0.5 shadow-sm shadow-indigo-500/20" data-testid="prepmind-logo" />
      {!compact && <div className="font-heading text-[15px] font-semibold tracking-tight">PrepMind <span className="text-indigo-600 dark:text-indigo-400">AI</span></div>}
    </div>
  );
}