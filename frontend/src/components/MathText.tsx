import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/contrib/mhchem";
import "katex/contrib/copy-tex";
import { katexOptions, normalizeMath, repairQuestionLatex } from "@/lib/markdown";
import { cn } from "@/lib/utils";

type MathTextProps = { text: string; inline?: boolean; className?: string };

/** Question text, options and explanations: Markdown with LaTeX and \ce{} chemistry. */
export const MathText = memo(function MathText({ text, inline = false, className }: MathTextProps) {
  const Wrapper = inline ? "span" : "div";
  return (
    <Wrapper className={cn("math-text break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, katexOptions]]}
        components={{
          p: inline ? ({ children }) => <>{children}</> : (props) => <p className="my-2 first:mt-0 last:mb-0" {...props} />,
          ul: (props) => <ul className="my-2 list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />,
          strong: (props) => <strong className="font-semibold" {...props} />,
          table: (props) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-left text-[13px]" {...props} /></div>,
          th: (props) => <th className="border-b border-slate-200 px-2 py-1.5 font-semibold dark:border-slate-700" {...props} />,
          td: (props) => <td className="border-b border-slate-100 px-2 py-1.5 dark:border-slate-800" {...props} />,
        }}
      >
        {normalizeMath(repairQuestionLatex(text))}
      </ReactMarkdown>
    </Wrapper>
  );
});
