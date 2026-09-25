/**
 * Turns a growing message into display text one complete sentence at a time,
 * dropping any sentence that's a question. The reply's single question is
 * shown separately in bold, so a stray one in the message would be a second
 * question. Paragraph breaks are kept.
 *
 *   const filter = sentenceFilter();
 *   filter.push("Great. Sound good? We ca") // → "Great."
 *   filter.push("Great. Sound good? We can help.", true) // → " We can help."
 */
/** "Which fits?", "**Which fits?**", "(like X or Y?)" are all questions. */
const isQuestion = (sentence: string) => /\?[\s*_"'”’)\]]*$/.test(sentence);

/** Plain text of the reply's question: no markdown, and only the first question if the model wrote two. */
export function cleanQuestion(question: string) {
  const plain = question.replace(/[*_]/g, "").trim();
  const end = plain.indexOf("?");
  return end === -1 ? plain : plain.slice(0, end + 1);
}

export function sentenceFilter() {
  let consumed = 0; // characters of the source handled so far
  let lastEnd = -1; // where the last written sentence ended in the source (-1: none yet)

  return {
    push(text: string, final = false) {
      let out = "";
      // A sentence ends at . ! ? : (plus any closing ** or brackets) before whitespace, or at a newline.
      const boundary = /[.!?:][*_"'”’)\]]*(?=\s)|\n/g;
      boundary.lastIndex = consumed;
      let start = consumed;
      const emit = (end: number) => {
        const raw = text.slice(start, end);
        const sentence = raw.trim();
        if (sentence && !isQuestion(sentence)) {
          const at = start + raw.indexOf(sentence);
          if (lastEnd >= 0) out += text.slice(lastEnd, at).includes("\n") ? "\n\n" : " ";
          out += sentence;
          lastEnd = at + sentence.length;
          consumed = end;
        }
        start = end;
      };
      for (let m = boundary.exec(text); m; m = boundary.exec(text)) emit(m.index + m[0].length);
      if (final) emit(text.length);
      return out;
    },
  };
}
