// Agent tools: things the onboarding agent does itself (research), kept
// separate from Ploy primitives in naming, schemas, and UI styling.
export const agentTools = {
  scrape_site: {
    name: "Scrape site",
    description: "Read a website's key pages (home, pricing, about, customers) and its branding.",
  },
  research_company: {
    name: "Research company",
    description: "Search the web for a company, its competitors, or look-alike businesses.",
  },
} as const;

export type AgentToolId = keyof typeof agentTools;
export const agentToolIds = Object.keys(agentTools) as [AgentToolId, ...AgentToolId[]];
