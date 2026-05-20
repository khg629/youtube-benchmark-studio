"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function AnalysisMarkdown({ text }: { text: string }) {
  return (
    <div className="analysis-md text-sm leading-7">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h2 className="mt-5 mb-2 border-b border-[color:var(--border)] pb-1 text-base font-bold text-[color:var(--foreground)]">
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h2 className="mt-5 mb-2 border-b border-[color:var(--border)] pb-1 text-base font-bold text-[color:var(--foreground)]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-4 mb-1.5 text-sm font-semibold text-[color:var(--foreground)]">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-3 mb-1 text-sm font-semibold text-[color:var(--foreground)]/90">{children}</h4>
          ),
          p: ({ children }) => <p className="my-2">{children}</p>,
          ul: ({ children }) => (
            <ul className="my-2 ml-1 list-outside list-disc space-y-1 pl-4 marker:text-[color:var(--muted)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-1 list-outside list-decimal space-y-1 pl-5 marker:text-[color:var(--muted)]">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-6">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-[color:var(--accent)]">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-[color:var(--foreground)]/90">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-[color:var(--accent)] pl-3 text-[color:var(--muted)]">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-[color:var(--border)] px-1 py-0.5 text-[12px]">
              {children}
            </code>
          ),
          hr: () => <hr className="my-4 border-[color:var(--border)]" />,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-[color:var(--accent)] underline"
            >
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
