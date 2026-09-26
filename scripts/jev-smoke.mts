// Smoke test: one Jev call through the AI Gateway with the app's env.
// node --env-file=.env.local --import tsx scripts/jev-smoke.mts
import { experimental_evaluate as evaluate } from "ai";

const t = Date.now();
const r = await evaluate({
  model: process.env.AI_MODEL_DECIDE ?? "typesafe-ai/jev",
  state: { question: "What's your website?", message: "we don't have one yet, still building it" },
  questions: {
    website: { type: "choice", instructions: "What does the message say about the user's website?", criteria: { has: "They gave a URL or name of a live site", none: "They have no website", not_live: "A site exists or is being built but isn't live yet" } },
    unsure: { type: "boolean", instructions: "Is the user unsure what to answer?" },
    fit: { type: "score", instructions: "How clearly did the user answer the question?", criteria: ["Not at all", "Partly", "Fully"] },
  },
});
console.log(JSON.stringify({ ms: Date.now() - t, answers: r.answers, usage: r.usage, warnings: r.warnings, model: r.response?.modelId }, null, 2));
