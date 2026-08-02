"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components, ExtraProps } from "react-markdown";
import { twMerge } from "@/lib/ui/twMerge";
import type { MarkdownContentProps } from "./MarkdownContent.types";

const REMARK_PLUGINS = [remarkGfm];

export function isSafeMarkdownHref(href?: string) {
  const lower = href?.toLowerCase() ?? "";

  return (
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("mailto:")
  );
}

const components: Components = {
  strong: ({ children }) => (
    <strong className="text-foreground-primary">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-foreground-primary">{children}</li>
  ),
  code: ({
    className,
    children,
    node,
  }: React.ComponentPropsWithoutRef<"code"> & ExtraProps) => {
    const isBlock =
      className?.includes("language-") ||
      (node?.position &&
        node.position.start.line !== node.position.end.line) ||
      node?.properties?.className;

    if (isBlock) {
      return (
        <code className="font_metric_caption my-2 block overflow-x-auto rounded-panel border border-border-default bg-surface-primary p-3 text-foreground-primary">
          {children}
        </code>
      );
    }

    return (
      <code className="font_metric_caption rounded-panel bg-surface-secondary px-1.5 py-0.5 text-foreground-primary">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="my-2">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border-active pl-3 text-foreground-secondary">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => {
    if (!isSafeMarkdownHref(href)) return <span>{children}</span>;

    return (
      <a
        className="text-accent underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active"
        href={href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {children}
      </a>
    );
  },
  img: () => null,
  h1: ({ children }) => (
    <h1 className="font_poppins font_header_3 mb-1 mt-4 text-foreground-primary">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="font_poppins font_header_4 mb-1 mt-4 text-foreground-primary">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="font_poppins font_body_1 mb-1 mt-3 text-foreground-primary">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="font_poppins font_body_2 mb-1 mt-3 text-foreground-primary">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="font_poppins font_body_3 mb-1 mt-2 text-foreground-primary">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="font_poppins font_body_4 mb-1 mt-2 text-foreground-primary">
      {children}
    </h6>
  ),
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  hr: () => <hr className="my-3 border-border-default" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="font_metric_caption min-w-full border-collapse">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border-default bg-surface-secondary px-2 py-1 text-left text-foreground-primary">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border-default px-2 py-1 text-foreground-primary">
      {children}
    </td>
  ),
};

export const MarkdownContent = memo(function MarkdownContent({
  className,
  content,
}: MarkdownContentProps) {
  if (!content) return null;

  return (
    <div
      className={twMerge(
        "font_poppins font_body_2 text-foreground-primary",
        className,
      )}
    >
      <ReactMarkdown components={components} remarkPlugins={REMARK_PLUGINS}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
