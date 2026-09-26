import type { UIMessage } from "ai";

/** A message's plain text: its text parts, plus the question it asks, if any. */
export const textOf = (message: UIMessage) =>
  message.parts
    .map((p) => {
      if (p.type === "text") return p.text;
      if (p.type === "data-question") {
        const { question, alt } = p.data as { question: string; alt: { question: string } | null };
        return `\n\n${question}${alt ? ` Or: ${alt.question}` : ""}`;
      }
      return "";
    })
    .join("")
    .trim();

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9.'/ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Whether `quote` really appears in what the user said, ignoring case,
 * punctuation, and spacing. A quote stitched from excerpts ("A ... B") counts
 * if every excerpt appears. Extractors must quote the user for every answer
 * they record; this drops anything the model made up.
 */
export const isQuoted = (quote: string, said: string) => {
  const excerpts = quote.split(/\.{3}|…/).map(normalize).filter(Boolean);
  const heard = normalize(said);
  return excerpts.length > 0 && excerpts.every((q) => heard.includes(q));
};
