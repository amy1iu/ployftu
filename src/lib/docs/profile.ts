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
export type SectionStatus = "empty" | "inferred" | "confirmed";
export type SectionMeta = { status: SectionStatus; source: "website" | "user" | null; updatedAt: string | null };

export function getProfileSection(slug: ProfileDocSlug, key: string) {
  const doc = profileDocs.find((d) => d.slug === slug)!;
  const section = doc.sections.find((s) => s.key === key);
  if (!section) throw new Error(`Unknown section ${slug}#${key}`);
  return section;
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
