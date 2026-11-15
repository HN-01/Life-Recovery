import React from 'react';

interface CoachMessageContentProps {
  content: string;
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={`${match.index}-code`}
          className="px-1.5 py-0.5 rounded bg-white/10 text-amber-300 font-mono text-[12px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={`${match.index}-b`} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={`${match.index}-i`} className="italic text-slate-200">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }

  return nodes;
}

export function CoachMessageContent({ content }: CoachMessageContentProps) {
  const segments = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-slate-200">
      {segments.map((seg, segIdx) => {
        if (seg.startsWith('```') && seg.endsWith('```')) {
          const inner = seg.slice(3, -3);
          const firstNewline = inner.indexOf('\n');
          const lang = firstNewline > -1 ? inner.slice(0, firstNewline).trim() : '';
          const codeBody = firstNewline > -1 ? inner.slice(firstNewline + 1) : inner;
          return (
            <div
              key={`code-${segIdx}`}
              className="rounded-lg overflow-hidden border border-white/10 bg-[#07080A]"
            >
              {lang && (
                <div className="px-3 py-1.5 border-b border-white/8 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  {lang}
                </div>
              )}
              <pre className="p-3 overflow-x-auto text-xs font-mono text-amber-200/95 leading-relaxed">
                <code>{codeBody.trimEnd()}</code>
              </pre>
            </div>
          );
        }

        const lines = seg.split('\n');
        const blocks: React.ReactNode[] = [];
        let listItems: Array<{ ordered: boolean; text: string }> = [];
        let isOrderedList = false;

        const flushList = (keySuffix: number) => {
          if (listItems.length === 0) return;
          if (isOrderedList) {
            blocks.push(
              <ol
                key={`ol-${segIdx}-${keySuffix}`}
                className="list-decimal list-outside pl-5 space-y-1 text-slate-200"
              >
                {listItems.map((item, idx) => (
                  <li key={idx}>{renderInline(item.text)}</li>
                ))}
              </ol>
            );
          } else {
            blocks.push(
              <ul
                key={`ul-${segIdx}-${keySuffix}`}
                className="list-disc list-outside pl-5 space-y-1 text-slate-200"
              >
                {listItems.map((item, idx) => (
                  <li key={idx}>{renderInline(item.text)}</li>
                ))}
              </ul>
            );
          }
          listItems = [];
        };

        lines.forEach((rawLine, lineIdx) => {
          const line = rawLine.trimEnd();
          const trimmed = line.trim();

          if (!trimmed) {
            flushList(lineIdx);
            return;
          }

          const headingMatch = /^(#{1,3})\s+(.*)$/.exec(trimmed);
          if (headingMatch) {
            flushList(lineIdx);
            blocks.push(
              <h4
                key={`h-${segIdx}-${lineIdx}`}
                className="text-sm font-semibold text-amber-300 pt-1"
              >
                {renderInline(headingMatch[2])}
              </h4>
            );
            return;
          }

          const ulMatch = /^[-*•]\s+(.*)$/.exec(trimmed);
          if (ulMatch) {
            if (listItems.length > 0 && isOrderedList) flushList(lineIdx);
            isOrderedList = false;
            listItems.push({ ordered: false, text: ulMatch[1] });
            return;
          }

          const olMatch = /^(\d+)[.)]\s+(.*)$/.exec(trimmed);
          if (olMatch) {
            if (listItems.length > 0 && !isOrderedList) flushList(lineIdx);
            isOrderedList = true;
            listItems.push({ ordered: true, text: olMatch[2] });
            return;
          }

          flushList(lineIdx);
          blocks.push(
            <p key={`p-${segIdx}-${lineIdx}`} className="text-slate-200">
              {renderInline(trimmed)}
            </p>
          );
        });

        flushList(lines.length);
        return <React.Fragment key={`seg-${segIdx}`}>{blocks}</React.Fragment>;
      })}
    </div>
  );
}
