// Quick wins check (phase 3): every recipe produces a real deliverable (not the
// template fallback) from a real site's profile, in reasonable time.
//
//   npm run check:quick-wins                       default site
//   npm run check:quick-wins -- https://example.com

import { quickWinIds } from "@/lib/catalog/quick-wins";
import { createWorkspace } from "@/lib/db/workspaces";
import { generateDeliverable } from "@/lib/quick-wins/generate";
import { deliverableMarkdown } from "@/lib/quick-wins/markdown";
import { readAndProfileSite } from "@/lib/site/run";
import { db } from "@/lib/supabase/admin";

const url = process.argv[2] ?? "https://www.intelligentsia.com";
const workspace = await createWorkspace({ isEval: true });
let failed = 0;
try {
  await readAndProfileSite({ workspaceId: workspace.id, url, afterMessageId: null });
  console.log(`Profile from ${url}; generating all ${quickWinIds.length} quick wins…\n`);
  await Promise.all(
    quickWinIds.map(async (recipeId) => {
      const started = Date.now();
      const { output, fallback } = await generateDeliverable(workspace.id, recipeId);
      const seconds = (Date.now() - started) / 1000;
      const pass = !fallback && seconds < 45;
      if (!pass) failed++;
      const preview = deliverableMarkdown(recipeId, output).split("\n").slice(2, 4).join(" ").slice(0, 110);
      console.log(`  ${pass ? "✓" : "✗"} ${recipeId.padEnd(20)} ${seconds.toFixed(1)}s${fallback ? "  FALLBACK" : ""}  ${preview}`);
    }),
  );
} finally {
  await db().from("workspaces").delete().eq("id", workspace.id);
}
console.log(`\n${failed ? `${failed} recipe(s) failed.` : "All quick wins pass."}`);
process.exit(failed ? 1 : 0);
