import { describe, expect, it } from "vitest";
import { pathOf, pickPages } from "./pages";

describe("pickPages", () => {
  const links = [
    "https://acme.com/",
    "https://acme.com/pricing",
    "https://www.acme.com/about/",
    "https://acme.com/about/team/leadership",
    "https://acme.com/blog/how-we-grew",
    "https://acme.com/blog",
    "https://acme.com/careers",
    "https://acme.com/privacy",
    "https://acme.com/features",
    "https://acme.com/customers",
    "https://acme.com/solutions/retail",
    "https://other.com/pricing",
    "/login",
  ];

  it("picks one page per kind, top-level first, same site only", () => {
    expect(pickPages("https://acme.com", links)).toEqual([
      "https://acme.com/pricing",
      "https://www.acme.com/about",
      "https://acme.com/features",
      "https://acme.com/solutions/retail",
    ]);
  });

  it("respects the limit", () => {
    expect(pickPages("https://acme.com", links, 2)).toEqual(["https://acme.com/pricing", "https://www.acme.com/about"]);
  });

  it("returns nothing when only the homepage is known", () => {
    expect(pickPages("https://acme.com", ["https://acme.com/", "https://acme.com/privacy"])).toEqual([]);
  });
});

it("labels pages by path", () => {
  expect(pathOf("https://acme.com")).toBe("/");
  expect(pathOf("https://acme.com/pricing/")).toBe("/pricing");
});
