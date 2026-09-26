import { describe, expect, it } from "vitest";
import { defaultQuickWin, emptyEntry, entryBranch, findUrl, nameFromUrl, normalizeUrl, type Entry } from "./entry";

const entry = (website: Entry["website"]["status"], goals: Entry["goals"]["status"], intent?: string): Entry => ({
  website: { status: website, url: website === "has" ? "https://acme.com" : null },
  goals: {
    ...emptyEntry.goals,
    status: goals,
    intents: intent ? [{ id: intent as Entry["goals"]["intents"][number]["id"], weight: 1 }] : [],
  },
});

describe("entryBranch", () => {
  it.each([
    ["has", "has", "A"],
    ["has", "unsure", "B"],
    ["none", "has", "C"],
    ["not_live", "has", "C"],
    ["unreadable", "has", "C"],
    ["none", "unsure", "D"],
    ["unknown", "has", null],
    ["has", "unknown", null],
  ] as const)("website %s + goals %s → %s", (w, g, branch) => {
    expect(entryBranch(entry(w, g))).toBe(branch);
  });
});

describe("defaultQuickWin", () => {
  it("uses the intent's quick win on path A", () => {
    expect(defaultQuickWin(entry("has", "has", "run_outbound"))).toBe("outreach_sequence");
  });
  it("audits the homepage on path B", () => {
    expect(defaultQuickWin(entry("has", "unsure"))).toBe("homepage_audit");
  });
  it("swaps site-dependent quick wins for a landing page on path C", () => {
    expect(defaultQuickWin(entry("none", "has", "convert_site_visitors"))).toBe("landing_page_draft");
    expect(defaultQuickWin(entry("none", "has", "grow_content_brand"))).toBe("social_posts");
  });
  it("drafts a landing page on path D", () => {
    expect(defaultQuickWin(entry("none", "unsure"))).toBe("landing_page_draft");
  });
});

describe("normalizeUrl", () => {
  it.each([
    ["acme.com", "https://acme.com"],
    ["www.Acme.com/about/", "https://www.acme.com/about"],
    ["http://acme.io", "http://acme.io"],
    ["linkedin.com/company/acme", "https://linkedin.com/company/acme"],
    ["greenleaf-landscaping,com", "https://greenleaf-landscaping.com"],
  ])("%s → %s", (raw, url) => expect(normalizeUrl(raw)).toBe(url));

  it.each(["acme", "acme, llc", "not a url", "", "https://"])("rejects %j", (raw) => {
    expect(normalizeUrl(raw)).toBeNull();
  });
});

it("names a workspace from its URL", () => {
  expect(nameFromUrl("https://www.acme-labs.com/x")).toBe("Acme Labs");
});

describe("findUrl", () => {
  it.each([
    ["My website is brightsmile-dental.com.", "https://brightsmile-dental.com"],
    ["It's greenleaf-landscaping,com.", "https://greenleaf-landscaping.com"],
    ["I sell on Etsy: etsy.com/shop/wildthreadco.", "https://etsy.com/shop/wildthreadco"],
    ["(see acme.io)", "https://acme.io"],
  ])("%s → %s", (text, url) => expect(findUrl(text)).toBe(url));

  it.each(["still building it", "email me at amy@acme.com", "It's not live yet."])("finds none in %j", (text) => {
    expect(findUrl(text)).toBeNull();
  });
});
