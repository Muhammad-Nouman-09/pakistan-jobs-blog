import { renderMarkdown } from "@/lib/markdown";

/** Renders trusted-after-escaping Markdown (see lib/markdown.ts — input is HTML-escaped before formatting). */
export default function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={className ?? "prose"} dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />;
}
