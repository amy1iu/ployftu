// AI Gateway model ids. Chat: Claude Haiku 4.5 was the best balance of speed
// (~1s to first token), instruction-following, and cost in evals. Replies are
// structured (see reply.ts), so the format holds on any model.
const chat = process.env.AI_MODEL ?? "anthropic/claude-haiku-4.5";

// Picks each Getting Started card (see ai/onboarding/prompt.ts), and every turn
// waits on it. In the entry eval, gpt-4.1 read intents and chose first wins
// best (100% where gpt-4.1-mini and gpt-5.4-mini missed one) at the same speed
// as gpt-4.1-mini's fast tier (~2.1s per turn); the reasoning model was twice
// as slow without better choices. Gemini Flash-Lite and gpt-4.1-nano were
// faster but made claims Ploy can't back or ended the trail early.
const planner = process.env.AI_MODEL_PLANNER ?? "openai/gpt-4.1";

/** Low reasoning effort for OpenAI reasoning models (gpt-5*, gpt-oss); nothing for the rest. */
const optionsFor = (model: string) => ({
  openai: /^openai\/(gpt-5|gpt-6|gpt-oss)/.test(model) ? { reasoningEffort: process.env.AI_REASONING_EFFORT ?? "low" } : {},
});

export const models = {
  chat,
  planner,
  plannerOptions: optionsFor(planner),
  // Recording the user's answers: precision matters more than speed (runs in parallel with the reply).
  extract: process.env.AI_MODEL_EXTRACT ?? "openai/gpt-4.1",
  // Small background jobs (reply chips): a fast non-reasoning model.
  fast: process.env.AI_MODEL_FAST ?? "openai/gpt-4.1-mini",
};
