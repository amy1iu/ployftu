import { describe, expect, it } from "vitest";
import { EMPTY_SECTION, patchSection, readSection, renderDoc } from "./markdown";

const doc = renderDoc("Business Overview", [
  { heading: "What we do", body: "" },
  { heading: "Website", body: "https://acme.com" },
  { heading: "Who we serve", body: "" },
]);

describe("profile doc sections", () => {
  it("renders empty sections with a placeholder", () => {
    expect(readSection(doc, "What we do")).toBe(EMPTY_SECTION);
  });

  it("replaces only the target section", () => {
    const patched = patchSection(doc, "What we do", "We make widgets.\n\n- fast\n- cheap");
    expect(readSection(patched, "What we do")).toBe("We make widgets.\n\n- fast\n- cheap");
    expect(readSection(patched, "Website")).toBe("https://acme.com");
    expect(readSection(patched, "Who we serve")).toBe(EMPTY_SECTION);
    expect(patched.startsWith("# Business Overview\n\n## What we do")).toBe(true);
  });

  it("patches the last section", () => {
    const patched = patchSection(doc, "Who we serve", "Ops teams");
    expect(readSection(patched, "Who we serve")).toBe("Ops teams");
    expect(readSection(patched, "Website")).toBe("https://acme.com");
  });

  it("appends a missing section", () => {
    const patched = patchSection(doc, "Differentiators", "Speed");
    expect(readSection(patched, "Differentiators")).toBe("Speed");
  });

  it("is stable when patched repeatedly", () => {
    const once = patchSection(doc, "Website", "https://acme.io");
    expect(patchSection(once, "Website", "https://acme.io")).toBe(once);
  });
});
