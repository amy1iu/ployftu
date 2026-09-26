// Business context a task needs before Ploy can do it well, e.g. who they sell
// to. Each key maps to a section of the profile Docs; it's known once that
// section has anything in it (from their site or their answers).
export const contextKeys = {
  offering: { doc: "business-overview", section: "what-we-do", need: "what you sell" },
  audience: { doc: "business-overview", section: "who-we-serve", need: "who you sell to" },
  goal: { doc: "goals-and-focus", section: "goals", need: "your goal" },
} as const;

export type ContextKey = keyof typeof contextKeys;
