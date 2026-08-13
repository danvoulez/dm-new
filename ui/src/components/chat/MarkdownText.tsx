import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) tokens.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = `${match.index}-${token}`;
    if (token.startsWith("**")) tokens.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) tokens.push(<code key={key} className="rounded bg-black/[0.06] px-1 py-0.5 text-[0.92em] dark:bg-white/[0.08]">{token.slice(1, -1)}</code>);
    else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      if (link) tokens.push(<a key={key} href={link[2]} target="_blank" rel="noreferrer" className="underline underline-offset-2">{link[1]}</a>);
      else tokens.push(token);
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) tokens.push(text.slice(cursor));
  return tokens;
}

export function MarkdownText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (!list.length) return;
    const items = list;
    list = [];
    blocks.push(<ul key={`list-${blocks.length}`} className="my-2 list-disc space-y-1 pl-5">{items.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>);
  };
  for (const line of lines) {
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item) { list.push(item[1]); continue; }
    flushList();
    if (!line.trim()) { blocks.push(<div key={`space-${blocks.length}`} className="h-2" />); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push(<div key={`heading-${blocks.length}`} className="mt-2 font-semibold">{inline(heading[2])}</div>);
    } else {
      blocks.push(<p key={`p-${blocks.length}`} className="leading-6">{inline(line)}</p>);
    }
  }
  flushList();
  return <div className="text-[14px]">{blocks}</div>;
}
