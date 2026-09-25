import { describe, expect, it } from "vitest";
import { z } from "zod";
import { entryUpdateSchema } from "@/lib/ai/onboarding/extract";
import { replySchema } from "@/lib/ai/onboarding/reply";
import { agentTools, allSpecs, getSpec, intents, primitives, quickWins, regionIds, regions } from ".";

describe("catalog integrity", () => {
  it("has unique spec ids", () => {
    const ids = allSpecs.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(allSpecs.map((s) => [s.id, s] as const))("spec %s uses real primitives, actions, and tools", (_, spec) => {
    expect(regionIds).toContain(spec.region);
    for (const step of spec.steps) {
      if (step.kind === "primitive") expect(Object.keys(primitives[step.primitive].actions)).toContain(step.action);
      else expect(Object.keys(agentTools)).toContain(step.tool);
    }
    for (const prereq of spec.prereqs) expect(getSpec(prereq), `prereq ${prereq}`).toBeDefined();
  });

  it.each(intents.map((i) => [i.id, i] as const))("intent %s points at real regions, templates, and a quick win", (_, intent) => {
    for (const region of Object.keys(intent.regions)) expect(regionIds).toContain(region);
    for (const id of intent.templates) expect(getSpec(id)?.source, id).toBe("template");
    expect(quickWins[intent.quickWin]).toBeDefined();
    for (const p of intent.primitives) expect(primitives[p]).toBeDefined();
    expect(intent.probes.length).toBeGreaterThan(0);
  });

  it("regions reference real primitives", () => {
    for (const region of regions) for (const p of region.primitives) expect(primitives[p]).toBeDefined();
  });

  it("every region has map templates", () => {
    for (const id of regionIds) expect(allSpecs.some((s) => s.source === "template" && s.region === id), id).toBe(true);
  });
});

// OpenAI strict structured output requires every object property to be required.
function optionalProperties(schema: z.ZodType) {
  const found: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (n.type === "object" && n.properties) {
      const required = new Set((n.required as string[]) ?? []);
      for (const key of Object.keys(n.properties as object)) if (!required.has(key)) found.push(`${path}.${key}`);
    }
    for (const [k, v] of Object.entries(n)) walk(v, `${path}/${k}`);
  };
  walk(z.toJSONSchema(schema, { io: "input" }), "$");
  return found;
}

describe("schemas are OpenAI strict-mode compatible", () => {
  const schemas: [string, z.ZodType][] = [
    ["entry extraction", entryUpdateSchema],
    ["onboarding reply", replySchema],
    ...Object.entries(quickWins).map(([id, q]) => [`quick win ${id}`, q.output] as [string, z.ZodType]),
    ...Object.entries(primitives).flatMap(([pid, p]) =>
      Object.entries(p.actions).map(([aid, a]) => [`${pid}.${aid}`, a.input] as [string, z.ZodType]),
    ),
  ];
  it.each(schemas)("%s has no optional fields", (_, schema) => {
    expect(optionalProperties(schema)).toEqual([]);
  });
});
