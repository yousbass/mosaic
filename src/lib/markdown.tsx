import React from "react";

// A small, safe Markdown renderer for AI answers: paragraphs, bullet and
// numbered lists, ### headings, **bold**, *italic* and `code`. It builds React
// elements directly (no HTML strings), so model or email text can never inject markup.

function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={key + i++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={key + i++}>{tok.slice(1, -1)}</code>);
    else out.push(<em key={key + i++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={"p" + blocks.length} dir="auto">{inline(para.join(" "), "p" + blocks.length)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, j) => <li key={j} dir="auto">{inline(it, "l" + blocks.length + "-" + j)}</li>);
    blocks.push(list.ordered ? <ol key={"o" + blocks.length} start={list.start}>{items}</ol> : <ul key={"u" + blocks.length}>{items}</ul>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*(?:[-*•]|•)\s+(.*)$/.exec(line);
    const num = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    const head = /^#{1,6}\s+(.*)$/.exec(line);
    if (bullet || num) {
      flushPara();
      const ordered = !!num;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, start: num ? Number(num[1]) : 1, items: [] }; }
      list.items.push(bullet ? bullet[1] : num![2]);
    } else if (list && /^\s{2,}\S/.test(raw)) {
      // an indented line continues the previous list item
      list.items[list.items.length - 1] += " " + line.trim();
    } else if (head) {
      flushPara(); flushList();
      blocks.push(<h4 key={"h" + blocks.length} dir="auto">{inline(head[1], "h" + blocks.length)}</h4>);
    } else if (!line.trim()) {
      flushPara(); // keep an open list: a blank line between items doesn't end it
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara(); flushList();
  return <div className={"md " + className}>{blocks}</div>;
}
