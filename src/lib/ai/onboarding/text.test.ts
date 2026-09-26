import { expect, it } from "vitest";
import { isQuoted } from "./text";

it("matches quotes regardless of case, punctuation, and spacing", () => {
  const said = "Most find us through Instagram — and our Klaviyo email list!";
  expect(isQuoted("most find us through instagram", said)).toBe(true);
  expect(isQuoted("our Klaviyo email list", said)).toBe(true);
  expect(isQuoted("User: Most find us", said)).toBe(false);
  expect(isQuoted("we use Shopify", said)).toBe(false);
  expect(isQuoted("  ", said)).toBe(false);
});

it("accepts a quote stitched from excerpts, if every excerpt was said", () => {
  const said = "I want cold outreach to HR leaders for PeoplePulse, our employee survey software.";
  expect(isQuoted("PeoplePulse, our employee survey software... cold outreach to HR leaders", said)).toBe(true);
  expect(isQuoted("PeoplePulse… we sell to banks", said)).toBe(false);
  expect(isQuoted("...", said)).toBe(false);
});
