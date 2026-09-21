"use client";

/**
 * Renderizador de Markdown a medida para el material de estudio.
 *
 * Se implementa aquí (en vez de usar una librería) por tres motivos:
 *  - convertir las referencias "(pág. 17)" en botones que abren esa página
 *    del PDF original,
 *  - dar formato propio a los avisos `> [!examen]`, `> [!aclaracion]` y
 *    `> [!duda]`, que son la base del contrato anti-alucinación,
 *  - no inyectar nunca HTML del modelo: todo se renderiza como texto React,
 *    así que no hay riesgo de XSS.
 */

import { Fragment, useMemo } from "react";
import { Icon } from "./ui/Icon";

type Inline = { type: "text" | "bold" | "italic" | "code"; value: string } | {
  type: "page";
  label: string;
  pages: number[];
};

type Block =
  | { type: "heading"; level: number; content: Inline[] }
  | { type: "paragraph"; content: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "callout"; kind: string; content: Inline[] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] }
  | { type: "rule" };

const PAGE_REF =
  /\((?:p[áa]gs?\.?|p[áa]ginas?)\s*([\d]+(?:\s*[-–a,y]\s*\d+)*)\s*\)/gi;

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];

  // Primero se extraen las referencias de página, que tienen prioridad.
  let cursor = 0;
  const refs: { start: number; end: number; label: string; pages: number[] }[] = [];
  for (const match of text.matchAll(PAGE_REF)) {
    const pages = (match[1].match(/\d+/g) ?? []).map(Number);
    refs.push({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      label: match[0].replace(/^\(|\)$/g, ""),
      pages,
    });
  }

  const pushStyled = (chunk: string) => {
    // **negrita**, *cursiva* y `código`
    const pattern = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|`[^`]+`)/g;
    let last = 0;
    for (const match of chunk.matchAll(pattern)) {
      const index = match.index ?? 0;
      if (index > last) out.push({ type: "text", value: chunk.slice(last, index) });
      const token = match[0];
      if (token.startsWith("**") || token.startsWith("__")) {
        out.push({ type: "bold", value: token.slice(2, -2) });
      } else if (token.startsWith("`")) {
        out.push({ type: "code", value: token.slice(1, -1) });
      } else {
        out.push({ type: "italic", value: token.slice(1, -1) });
      }
      last = index + token.length;
    }
    if (last < chunk.length) out.push({ type: "text", value: chunk.slice(last) });
  };

  for (const ref of refs) {
    if (ref.start > cursor) pushStyled(text.slice(cursor, ref.start));
    out.push({ type: "page", label: ref.label, pages: ref.pages });
    cursor = ref.end;
  }
  if (cursor < text.length) pushStyled(text.slice(cursor));

  return out;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", content: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: heading[1].length,
        content: parseInline(heading[2]),
      });
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: "rule" });
      continue;
    }

    const callout = /^>\s*\[!(\w+)\]\s*(.*)$/.exec(trimmed);
    if (callout) {
      flushParagraph();
      const body = [callout[2]];
      // Las líneas siguientes que sigan siendo cita pertenecen al mismo aviso.
      while (i + 1 < lines.length && /^>\s*(?!\[!)/.test(lines[i + 1].trim())) {
        body.push(lines[i + 1].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({
        type: "callout",
        kind: callout[1].toLowerCase(),
        content: parseInline(body.join(" ").trim()),
      });
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      const body = [trimmed.replace(/^>\s?/, "")];
      while (i + 1 < lines.length && /^>\s?/.test(lines[i + 1].trim())) {
        body.push(lines[i + 1].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "callout", kind: "cita", content: parseInline(body.join(" ")) });
      continue;
    }

    if (/^\|.*\|$/.test(trimmed)) {
      flushParagraph();
      const header = splitRow(trimmed).map(parseInline);
      const rows: Inline[][][] = [];
      let cursor = i + 1;
      if (cursor < lines.length && /^\|[\s:|-]+\|$/.test(lines[cursor].trim())) {
        cursor += 1;
        while (cursor < lines.length && /^\|.*\|$/.test(lines[cursor].trim())) {
          rows.push(splitRow(lines[cursor].trim()).map(parseInline));
          cursor += 1;
        }
        blocks.push({ type: "table", header, rows });
        i = cursor - 1;
        continue;
      }
    }

    const bullet = /^[-*+•]\s+(.*)$/.exec(trimmed);
    const ordered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const items: Inline[][] = [parseInline((bullet?.[1] ?? ordered?.[2]) as string)];

      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        const nextBullet = /^[-*+•]\s+(.*)$/.exec(nextLine);
        const nextOrdered = /^(\d+)[.)]\s+(.*)$/.exec(nextLine);
        if ((isOrdered && nextOrdered) || (!isOrdered && nextBullet)) {
          items.push(parseInline((nextBullet?.[1] ?? nextOrdered?.[2]) as string));
          i += 1;
        } else break;
      }

      blocks.push({ type: "list", ordered: isOrdered, items });
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  return blocks;
}

const CALLOUT_META: Record<string, { label: string; icon: string; className: string }> = {
  examen: { label: "Importante para el examen", icon: "flame", className: "callout-examen" },
  aclaracion: {
    label: "Aclaración añadida (no está en el PDF)",
    icon: "sparkles",
    className: "callout-aclaracion",
  },
  duda: {
    label: "No queda claro en el documento original",
    icon: "warning",
    className: "callout-duda",
  },
  cita: { label: "", icon: "file", className: "callout-cita" },
};

function InlineRun({
  content,
  onPageClick,
}: {
  content: Inline[];
  onPageClick?: (page: number) => void;
}) {
  return (
    <>
      {content.map((node, index) => {
        if (node.type === "bold") return <strong key={index}>{node.value}</strong>;
        if (node.type === "italic") return <em key={index}>{node.value}</em>;
        if (node.type === "code") return <code key={index}>{node.value}</code>;
        if (node.type === "page") {
          const page = node.pages[0];
          return (
            <button
              key={index}
              type="button"
              className="page-ref"
              title={
                onPageClick
                  ? `Abrir la página ${page} del PDF original`
                  : "Referencia al PDF original"
              }
              onClick={() => (page && onPageClick ? onPageClick(page) : undefined)}
            >
              <Icon name="file" size={11} strokeWidth={2} />
              {node.label}
            </button>
          );
        }
        return <Fragment key={index}>{node.value}</Fragment>;
      })}
    </>
  );
}

export function Markdown({
  markdown,
  onPageClick,
  className = "",
}: {
  markdown: string;
  onPageClick?: (page: number) => void;
  className?: string;
}) {
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);

  return (
    <div className={`prose-study ${className}`}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading": {
            const Tag = (`h${Math.min(block.level, 4)}` as unknown) as "h1";
            return (
              <Tag key={index}>
                <InlineRun content={block.content} onPageClick={onPageClick} />
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p key={index}>
                <InlineRun content={block.content} onPageClick={onPageClick} />
              </p>
            );
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag key={index}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <InlineRun content={item} onPageClick={onPageClick} />
                  </li>
                ))}
              </Tag>
            );
          }
          case "callout": {
            const meta = CALLOUT_META[block.kind] ?? CALLOUT_META.cita;
            return (
              <div key={index} className={`callout ${meta.className}`}>
                <span className="mt-0.5 shrink-0">
                  <Icon name={meta.icon} size={16} />
                </span>
                <span>
                  {meta.label ? (
                    <strong className="mr-1.5 text-[0.78rem] uppercase tracking-wide">
                      {meta.label}:
                    </strong>
                  ) : null}
                  <InlineRun content={block.content} onPageClick={onPageClick} />
                </span>
              </div>
            );
          }
          case "table":
            return (
              <div key={index} className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th key={cellIndex}>
                          <InlineRun content={cell} onPageClick={onPageClick} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>
                            <InlineRun content={cell} onPageClick={onPageClick} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "rule":
            return <hr key={index} className="my-6" />;
          default:
            return null;
        }
      })}
    </div>
  );
}
