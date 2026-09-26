import { contextKeys, type ContextKey } from "@/lib/catalog/context";
import { renderDoc } from "./markdown";

// The business profile, split into topic Docs (Ploy's convention). Together
// they're the source of truth for every agent in the workspace.
export const profileDocs = [
  {
    slug: "business-overview",
    title: "Business Overview",
    sections: [
      { key: "what-we-do", heading: "What we do" },
      { key: "who-we-serve", heading: "Who we serve" },
      { key: "offering", heading: "Offering & pricing" },
      { key: "website", heading: "Website" },
      { key: "differentiators", heading: "What makes us different" },
    ],
  },
  {
    slug: "goals-and-focus",
    title: "Goals & Focus",
    sections: [
      { key: "goals", heading: "Goals" },
      { key: "focus-areas", heading: "Focus areas" },
      { key: "challenges", heading: "Challenges" },
      // Added after launch: older workspaces don't have it until it's first written (patchSection appends it).
      { key: "constraints", heading: "Constraints" },
    ],
  },
  {
    slug: "channels-and-tools",
    title: "Channels & Tools",
    sections: [
      { key: "acquisition", heading: "How customers find us" },
      { key: "outreach", heading: "Outreach today" },
      { key: "tools", heading: "Tools we use" },
    ],
  },
  {
    slug: "brand-guidelines",
    title: "Brand Guidelines",
    sections: [
      { key: "voice", heading: "Voice & tone" },
      { key: "colors", heading: "Colors" },
      { key: "typography", heading: "Typography" },
      { key: "logo", heading: "Logo" },
      { key: "pillars", heading: "Messaging pillars" },
    ],
  },
] as const;

export type ProfileDocSlug = (typeof profileDocs)[number]["slug"];

// Profile sections the user fills in as the conversation goes. Anything they
// tell us about these, at any point, is written into the Docs as confirmed.
export const noteSections = [
  ["business-overview", "what-we-do", "what the business does"],
  ["business-overview", "offering", "their products or services, and pricing"],
  ["business-overview", "who-we-serve", "who their customers are"],
  ["business-overview", "differentiators", "what makes them different from competitors"],
  ["goals-and-focus", "challenges", "problems or frustrations with marketing and growth"],
  ["goals-and-focus", "constraints", "limits on budget, time, team, or compliance that rule things in or out"],
  ["channels-and-tools", "acquisition", "how customers find them today (channels)"],
  ["channels-and-tools", "outreach", "how they reach out to or follow up with prospects today"],
  ["channels-and-tools", "tools", "software and services they use (CRM, email, store, ads, analytics)"],
  ["brand-guidelines", "voice", "how their brand should sound"],
] as const satisfies readonly (readonly [ProfileDocSlug, string, string])[];

export type SectionStatus = "empty" | "inferred" | "confirmed";
export type SectionMeta = { status: SectionStatus; source: "website" | "user" | null; updatedAt: string | null };

export function getProfileSection(slug: ProfileDocSlug, key: string) {
  const doc = profileDocs.find((d) => d.slug === slug)!;
  const section = doc.sections.find((s) => s.key === key);
  if (!section) throw new Error(`Unknown section ${slug}#${key}`);
  return section;
}

/** Whether the profile already says this: from their site or their answers, or (`confirmed`) from them. */
export function hasContext(
  docs: { slug: string; sections: Record<string, SectionMeta> }[],
  key: ContextKey,
  { confirmed = false } = {},
) {
  const { doc, section } = contextKeys[key];
  const status = docs.find((d) => d.slug === doc)?.sections[section]?.status;
  return confirmed ? status === "confirmed" : !!status && status !== "empty";
}

export function emptyProfileDocs() {
  return profileDocs.map((doc) => ({
    slug: doc.slug,
    title: doc.title,
    kind: "profile" as const,
    content_md: renderDoc(
      doc.title,
      doc.sections.map((s) => ({ heading: s.heading, body: "" })),
    ),
    sections: Object.fromEntries(
      doc.sections.map((s) => [s.key, { status: "empty", source: null, updatedAt: null } satisfies SectionMeta]),
    ),
  }));
}
