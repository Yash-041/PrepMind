import { useState } from "react";
import type { ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PasswordInputProps extends Omit<ComponentProps<typeof Input>, "type"> {
  toggleTestId: string;
}

export function PasswordInput({ toggleTestId, className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return <div className="relative mt-2"><Input {...props} type={visible ? "text" : "password"} className={cn("pr-10", className)} /><button type="button" onClick={() => setVisible((value) => !value)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:text-indigo-300" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} data-testid={toggleTestId}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>;
}