// Profile docs are plain Markdown with fixed `## ` sections. Agents patch one
// section at a time so they never clobber the rest of a doc.

export const EMPTY_SECTION = "_Not known yet._";

export function renderDoc(title: string, sections: { heading: string; body: string }[]) {
  return [`# ${title}`, ...sections.map((s) => `## ${s.heading}\n\n${s.body.trim() || EMPTY_SECTION}`)].join(
    "\n\n",
  );
}

function findSection(md: string, heading: string) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) return null;
  let end = lines.findIndex((l, i) => i > start && /^#{1,2} /.test(l));
  if (end === -1) end = lines.length;
  return { lines, start, end };
}

export function readSection(md: string, heading: string): string | null {
  const found = findSection(md, heading);
  if (!found) return null;
  return found.lines.slice(found.start + 1, found.end).join("\n").trim();
}

export function patchSection(md: string, heading: string, body: string): string {
  const found = findSection(md, heading);
  const block = `## ${heading}\n\n${body.trim() || EMPTY_SECTION}`;
  if (!found) return `${md.trimEnd()}\n\n${block}`;
  const { lines, start, end } = found;
  const after = lines.slice(end).join("\n");
  return [lines.slice(0, start).join("\n").trimEnd(), block, after].filter(Boolean).join("\n\n");
}
