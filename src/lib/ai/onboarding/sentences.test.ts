import { describe, expect, it } from "vitest";
import { cleanQuestion, sentenceFilter } from "./sentences";

/** Feeds text in growing chunks, like a streamed partial object, and joins the output. */
function stream(text: string, step = 3) {
  const filter = sentenceFilter();
  let out = "";
  for (let i = step; i < text.length; i += step) out += filter.push(text.slice(0, i));
  return out + filter.push(text, true);
}

describe("sentenceFilter", () => {
  it("passes statements through unchanged", () => {
    expect(stream("Got it, a bakery in Austin. Ploy can build your first landing page.")).toBe(
      "Got it, a bakery in Austin. Ploy can build your first landing page.",
    );
  });

  it("drops stray questions", () => {
    expect(stream("Here are three options. Which sounds closest? I'd start with the first.")).toBe(
      "Here are three options. I'd start with the first.",
    );
    expect(stream("Great start. Sound good?")).toBe("Great start.");
  });

  it("only releases complete sentences until the end", () => {
    const filter = sentenceFilter();
    expect(filter.push("Great. We ca")).toBe("Great.");
    expect(filter.push("Great. We can help")).toBe("");
    expect(filter.push("Great. We can help.", true)).toBe(" We can help.");
  });

  it("keeps paragraph breaks and lists", () => {
    expect(stream("Three starting points:\n- A landing page\n- Local ads\n\nI'd start with the page.")).toBe(
      "Three starting points:\n\n- A landing page\n\n- Local ads\n\nI'd start with the page.",
    );
  });

  it("doesn't split URLs, decimals, or bold", () => {
    expect(stream("Got acme.com and your 2.5x goal. Ploy can draft a **3-step sequence** for you.")).toBe(
      "Got acme.com and your 2.5x goal. Ploy can draft a **3-step sequence** for you.",
    );
  });

  it("drops questions wrapped in markdown or parentheses", () => {
    expect(stream("Three options for you. **Which sounds closest?** I'd start with ads.")).toBe(
      "Three options for you. I'd start with ads.",
    );
    expect(stream("Tell me about customers. (Like locals or tourists?)")).toBe("Tell me about customers.");
  });

  it("returns nothing for an empty message", () => {
    expect(stream("")).toBe("");
  });
});

describe("cleanQuestion", () => {
  it("strips markdown and keeps only the first question", () => {
    expect(cleanQuestion("****What's your top goal?****")).toBe("What's your top goal?");
    expect(cleanQuestion("Is there a goal you want to move? Or should I suggest one?")).toBe(
      "Is there a goal you want to move?",
    );
    expect(cleanQuestion("Describe your business in one sentence.")).toBe("Describe your business in one sentence.");
  });
});
