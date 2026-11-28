// Tiny, dependency-free, XSS-safe Markdown subset for blog posts: headings, paragraphs, bullet/numbered
// lists, block quotes, rules, **bold**, *italic*, `code` and [links](https://…). ALL input is HTML-escaped
// first, and only the tags generated here can appear in the output; link targets are limited to
// http(s), mailto and same-site paths.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function safeHref(raw: string): string | null {
  const url = raw.replace(/&amp;/g, "&").trim();
  if (/^https?:\/\/[^\s<>"']+$/i.test(url) || /^mailto:[^\s<>"']+$/i.test(url) || /^\/(?!\/)[^\s<>"']*$/.test(url)) return esc(url);
  return null;
}

function inline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text: string, href: string) => {
      const safe = safeHref(href);
      if (!safe) return text;
      const external = /^https?:/i.test(href.replace(/&amp;/g, "&"));
      return `<a href="${safe}"${external ? ' rel="nofollow noopener noreferrer" target="_blank"' : ""}>${text}</a>`;
    });
}

export function renderMarkdown(source: string): string {
  const lines = esc(source.replace(/\r\n?/g, "\n")).split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`); list = null; } };

  for (const line of lines) {
    const t = line.trim();
    let m: RegExpMatchArray | null;
    if (!t) { flushPara(); flushList(); }
    else if ((m = t.match(/^(#{1,4})\s+(.+)$/))) {
      flushPara(); flushList();
      const level = Math.min(Math.max(m[1].length + 1, 2), 4);   // the page title is the only <h1>
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
    } else if (/^(-{3,}|\*{3,})$/.test(t)) { flushPara(); flushList(); out.push("<hr />"); }
    else if ((m = t.match(/^[-*]\s+(.+)$/))) { flushPara(); if (list?.tag !== "ul") { flushList(); list = { tag: "ul", items: [] }; } list.items.push(m[1]); }
    else if ((m = t.match(/^\d+[.)]\s+(.+)$/))) { flushPara(); if (list?.tag !== "ol") { flushList(); list = { tag: "ol", items: [] }; } list.items.push(m[1]); }
    else if ((m = t.match(/^&gt;\s?(.*)$/))) { flushPara(); flushList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else { flushList(); para.push(t); }
  }
  flushPara(); flushList();
  return out.join("\n");
}

/** Plain-text excerpt for meta descriptions (strips markdown markers). */
export function plainExcerpt(source: string, max = 160): string {
  return source.replace(/[#>*_`\[\]()-]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
