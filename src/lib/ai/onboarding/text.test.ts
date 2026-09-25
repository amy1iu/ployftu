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
