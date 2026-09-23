import { tool, type InferUITools, type UIMessage } from "ai";
import { z } from "zod";
import { catalog } from "./catalog";

// Any AI Gateway model id works here, e.g. "openai/gpt-5.1".
export const model = process.env.AI_MODEL ?? "anthropic/claude-sonnet-4.5";

export const systemPrompt = `You are the onboarding guide for a new user.
Have a short, friendly conversation to learn who they are, what they want to
accomplish, and how experienced they are. Ask one question at a time.
Once you understand their goals, call \`recommendProducts\` with the best
matches from the catalog and briefly explain why each one fits.

Catalog:
${catalog.map((p) => `- ${p.id}: ${p.name} — ${p.description}`).join("\n")}`;

export const tools = {
  recommendProducts: tool({
    description:
      "Recommend products or workflows to the user once their goals are clear.",
    inputSchema: z.object({
      recommendations: z
        .array(
          z.object({
            productId: z.enum(catalog.map((p) => p.id) as [string, ...string[]]),
            reason: z.string().describe("One sentence on why this fits the user"),
          }),
        )
        .min(1)
        .max(3),
    }),
    execute: async ({ recommendations }) =>
      recommendations.map((r) => ({
        ...r,
        product: catalog.find((p) => p.id === r.productId)!,
      })),
  }),
};

export type OnboardingUIMessage = UIMessage<
  never,
  never,
  InferUITools<typeof tools>
>;
