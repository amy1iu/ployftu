import type { UIMessage } from "ai";

/** A message's plain text (its text parts, joined). */
export const textOf = (message: UIMessage) =>
  message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
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
 * punctuation, and spacing. Extractors must quote the user for every answer
 * they record; this drops anything the model made up.
 */
export const isQuoted = (quote: string, said: string) => {
  const q = normalize(quote);
  return q.length > 0 && normalize(said).includes(q);
};
