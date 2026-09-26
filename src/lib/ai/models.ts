// AI Gateway model ids. Chat: Claude Haiku 4.5 was the best balance of speed
// (~1s to first token), instruction-following, and cost in evals. Replies are
// structured (see reply.ts), so the format holds on any model.
const chat = process.env.AI_MODEL ?? "anthropic/claude-haiku-4.5";

export const models = {
  chat,
  // Recording the user's answers: precision matters more than speed (runs in parallel with the reply).
  extract: process.env.AI_MODEL_EXTRACT ?? "openai/gpt-4.1",
  // Typed decisions on the trail (what an answer means, what to ask next): a
  // decision model that returns probabilities, not text. See ai/jev.ts.
  decide: process.env.AI_MODEL_DECIDE ?? "typesafe-ai/jev",
  // Small background jobs (reply chips): a fast non-reasoning model.
  fast: process.env.AI_MODEL_FAST ?? "openai/gpt-4.1-mini",
  // Only applies to OpenAI reasoning models (gpt-5*).
  chatOptions: {
    openai: chat.startsWith("openai/gpt-5") ? { reasoningEffort: process.env.AI_REASONING_EFFORT ?? "low" } : {},
  },
};
