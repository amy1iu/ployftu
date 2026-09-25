import { agentTools } from "./agent-tools";
import { intents } from "./intents";
import { templates, type PloybookSpec } from "./ploybooks";
import { primitives } from "./primitives";
import { quickWins } from "./quick-wins";
import { regions } from "./regions";

export * from "./agent-tools";
export * from "./integrations";
export * from "./intents";
export * from "./ploybooks";
export * from "./primitives";
export * from "./quick-wins";
export * from "./regions";

export const allSpecs: PloybookSpec[] = [...templates, ...Object.values(quickWins).map((q) => q.spec)];

export const getSpec = (id: string) => allSpecs.find((s) => s.id === id);

// Compact catalog description for agent system prompts.
export function catalogForPrompt() {
  const lines = [
    "Ploy primitives (the product's building blocks):",
    ...Object.values(primitives).map((p) => `- ${p.name}: ${p.description}`),
    "",
    "Your own research tools (not Ploy primitives):",
    ...Object.values(agentTools).map((t) => `- ${t.name}: ${t.description}`),
    "",
    "Growth map regions:",
    ...regions.map((r) => `- ${r.name}: ${r.description}`),
    "",
    "User intents (label; example phrasings; follow-up questions; first deliverable):",
    ...intents.map(
      (i) =>
        `- ${i.label}; e.g. ${i.examples.map((e) => `"${e}"`).join(", ")}; follow-ups: ${i.probes.join(" / ")}; first deliverable: ${quickWins[i.quickWin].spec.name}`,
    ),
    "",
    "Quick wins Ploy can deliver in about two minutes:",
    ...Object.values(quickWins).map((q) => `- ${q.spec.name}: ${q.spec.goal}`),
    "",
    "Example Ploybooks (automations) on the map:",
    ...templates.map((t) => `- ${t.name}: ${t.goal}`),
  ];
  return lines.join("\n");
}
