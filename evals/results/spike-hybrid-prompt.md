# Spike: hybrid prompt planner for the Getting Started trail

Branch `spike/hybrid-prompt`, from checkpoint `db44e43`.

**The idea.** Each turn, the chat model (Haiku 4.5, `models.chat`) gets a registry of the context we want to collect. In one structured call it decides which item to ask about next, or whether to finish, and writes the wording. Code enforces only two rules:

1. The website question always comes first.
2. The trail stops after 6 answers.

Ordering, not re-asking, offering the quick win, and when to stop are left to the prompt, and the evals measure them.

## Results

**Behavior matches or beats the fixed state machine. Latency is about 3× worse.**

- The planner never re-asked a known item and never stopped early. It never failed to stop either.
- It asks fewer cards: a mean of 3.7 against 4.5 for the checkpoint, because it drops the tool question.
- The first win starts on the same turn as before (median turn 3).
- Every turn after the website now costs a Haiku call, about 2.1s more than before. A chip tap went from 0.7s to 2.8s (p50).
- Every existing gate still passes except the two latency gates.

### Metrics vs baseline (full 24-persona `npm run eval:entry`)

Baseline: the checkpoint's trail run through this branch's eval (commit `329e5a9`, which only adds the metrics), full run, file `evals/results/baseline-checkpoint.json`. Spike: `evals/results/spike-final.json` (commit `68ca022`).

| Metric | Baseline (checkpoint) | Spike (planner) |
|---|---|---|
| `reaskedKnown` (total) | 0 | **0** |
| `questionsToDone` median / mean | 4 / 4.54 | 4 / **3.71** |
| `stoppedEarly` | 0 | 0 |
| `neverStopped` | 0 | 0 |
| `turnsToQuickWin` median / mean (never) | 3 / 2.71 (0) | 3 / 2.88 (0) |
| `msPerTurn` p50 / p95 | 945 / 3544 ms | **3271 / 5938 ms** |
| `chipTapMs` p50 | 688 ms (n=69) | **2799 ms** (n=53) |
| Answer to next card p50 / p95 (gate ≤2000 / ≤4000) | 1372 / 3674 ✓ | 3474 / 5937 ✗ |
| Path classified | 100% | 100% |
| Top intent matches | 92% (a_pipeline failed) | 92% (a_measure failed) |
| First win fits goal | 94% | 100% |
| Goal's Ploybooks on map (recall) | 98% | 98% |
| Reaches end of trail | 100% | 100% |
| Cards to finish, max | 6 | 5 |
| Questions ≤15 words | 99% | 100% |
| 2–5 chips | 100% | 100% |
| Re-asks an answered slot | 0 | 0 |
| Answers land in right doc section | 100% | 100% |
| Personas errored | 0 | 0 |
| Planner cards dropped by code | n/a | 0 |

The intent miss in each run comes from the simulated user, not the trail. In the spike, a_measure tapped "Convert more site visitors" for a "know what's working" goal. That goal is not among the default goal chips in either version.

### How often each item was asked (all personas)

| Item | Baseline | Spike |
|---|---|---|
| website | 24 | 25 |
| goal_detail (incl. the fork) | 31 | 32 |
| target_customer | 21 | 23 |
| business_model | 9 | 9 |
| tool | 24 | **0** |
| current_acquisition / constraints | – | 0 / 0 |
| Cards showing the quick-win fork | 26 | 35 |
| Total cards | 109 | 89 |

The planner finishes as soon as three things are true: the goal is known or answered, who they want to reach is known or answered, and a quick win is running. So it never reaches the tool question. Tasks anchored to `tool` now show at the end of the trail. `current_acquisition` and `constraints` were only asked in early iterations, when the model wasn't stopping.

### Latency

| Where the time goes | ms |
|---|---|
| DB work before the model: recording a tapped chip, reloading state, starting the quick win (same as baseline) | ~300–1000 |
| Haiku planner call, time to first token (~3.8k-token prompt) | ~950–1500 |
| Haiku planner call, total (~110 output tokens with a fork, ~60 without) | ~2000–3100 |
| Same call on `openai/gpt-4.1-mini`, measured once for comparison only | ~1000–2000 |
| Rare gateway outliers (msPerTurn p95 per persona up to 11s) | 9000–11000 |

- The prompt is under Haiku's 4096-token minimum for prompt caching, so caching can't help.
- Anthropic `structuredOutputMode` (`jsonTool` vs `outputFormat`) made no measurable difference.
- Output tokens dominate the time.
- A chip tap waits about 2.5s with no text streaming, because the message is usually empty until the card arrives.

## What changed

- **`src/lib/catalog/context.ts`**
  - New registry `contextItems`, keyed by `contextItemIds`: `website`, `target_customer`, `business_model`, `current_acquisition`, `constraints`, `goal_detail`, `quick_win_offer`, `tool`.
  - Each item has a pill `label`, a `why`, the profile `sections` it's recorded in, `known(state)`, and `inferred(state)`.
  - `contextKeys` (used by `PloybookSpec.needsContext`) stays, with a new `item` field mapping `offering`→`business_model`, `audience`→`target_customer` and `goal`→`goal_detail`.
  - Section status is read inline to avoid an import cycle with `docs/profile`.
- **`src/lib/docs/profile.ts`**: new `goals-and-focus#constraints` section. Older workspaces work unchanged:
  - `patchSection` appends a missing heading.
  - `known()` treats a missing section as empty.
- **`src/lib/onboarding/trail.ts`**
  - `AnsweredSlot` and `QuestionData.slot` are now `ContextItemId`, and `alt.slot` is `"quick_win_offer"`. `slotLabels` and `QuestionSlot` are removed.
  - `nextQuestion()` returns one of three things: the hardcoded `websiteQuestion()`, `null` at `MAX_ANSWERED = 6`, or `"plan"`.
  - New pure helpers:
    - `itemStatus`: known / answered / inferred / reading / missing / unavailable.
    - `chipOptions`: the fixed chip providers for goal, quick win and tool.
    - `pickChips`: maps the model's chips onto provider options, by option number or label.
    - `toQuestion`: turns the model's card into a `QuestionData`, or `null`.
  - `openQuestion` now counts only answers after the card, so an item can be asked again.
- **`src/lib/ai/onboarding/reply.ts`**: `turnSchema` = `{ message, next: { item, question, hint, chips, alt: {question, hint, chips} | null } | null }`, using `.nullable()`. `writeMessage` still streams the message a sentence at a time, then the card.
- **`src/lib/ai/onboarding/prompt.ts`**: `buildTrailPrompt` is now the planner prompt. It contains:
  - The registry, grouped into Done (with recorded values), Don't ask, Inferred (with what the site says), and Open (with `why`, fixed options, the `toolToAsk` hint, and the goal's `audienceQuestion`).
  - A readiness line.
  - The quick win's state.
  - The site summary and opportunities.
  - The trail so far: cards, what they said, and what was recorded.
  - The entry, the profile docs, and `catalogForPrompt()`.
  - Planning rules plus the existing message rules (off-script replies, unrecorded answers).
- **`src/lib/ai/onboarding/index.ts`**
  - The model is called on every planned turn. It is also called when the card is fixed (website, or the cap) but there's something to reply to.
  - `needsWords` is removed.
  - A picked quick win doesn't start if one is already running.
  - Cards code can't serve are logged (`planner_card_dropped`) and end the trail.
- **`src/lib/onboarding/answer.ts`**
  - New generic branch for profile-backed items in both `applyChip` and `applyTyped`. It writes the chip label or typed text to every section of the item, status confirmed, source user. `what-we-do` is only written while empty.
  - The pill summary is `answer.summary` or the chip label.
  - `website`, `goal_detail`, `quick_win_offer`, `tool` and `target_customer` keep their special cases. `target_customer` keeps them for `whoTheyServe` and "all of the above".
- **`src/lib/quick-wins/start.ts`**: waits on `answered.has("target_customer")` instead of `followup`.
- **`src/lib/map/plan.ts`**
  - `Anchor` = `"site" | "build" | Exclude<ContextItemId, "website">`.
  - Tasks waiting on context anchor to `contextKeys[key].item`.
  - The goal fallback is `goal_detail`.
  - `legacyAnchors` maps anchors already stored in the DB.
- **UI**
  - `trail.tsx` renders the fork whenever `question.alt` is set.
  - `nodes.tsx` takes pill labels from the registry, and the fork's main-card label follows its item.
  - `layout.ts` keys rows by item and maps legacy anchors.
- **Evals and scripts**
  - `entry.eval.mts` adds the new metrics, a transcript line for any fork, and a legacy slot map so the checkpoint can be measured.
  - `extract.eval.mts`, `map.check.mts` and `scripts/funnel.mts` use the new slot names. `npm run check:map` passes.
- **Tests**
  - `trail.test.ts` is rewritten: nextQuestion rules, itemStatus, registry `known`, pickChips, toQuestion, openQuestion re-ask.
  - `plan.test.ts`, `start.test.ts` and `catalog.test.ts` are updated.
  - 156 tests pass (143 before).

## Design decisions and deviations

- **Catalog chips are never relabeled (a deviation from "may relabel").** Haiku once relabeled a quick-win option "Skip for now". Mapped by option number, tapping it would have started that quick win. Chips for goal, quick win and tool now always show the provider's label. The model can still choose, reorder and drop them. If fewer than two valid chips are left, all the options are shown.
- **The stopping signal is computed in code but not enforced.** Haiku ignored "stop when goal and target are in" as a rule. It also ignored a "READY TO FINISH" line while the remaining items were still listed as askable.
  - What worked: when ready, the `next` instruction says null, the message rule asks for a wrap-up, and remaining items are relabeled "Not needed now".
  - The model can still ask more if the user asks for more questions. So the decision stays with the prompt, but the hint is strong.
- **Grouping beats per-item status.** With a status on each item, Haiku re-asked a KNOWN goal even in isolation (3/3 times in a bench). Grouping items into Done / Don't ask / Inferred / Open, and showing the recorded values, fixed it.
- **What counts as "known":**
  - `target_customer` is known only when the user confirmed it. A value inferred from their site is `inferred`, so the model confirms it rather than asking cold. This matches the old follow-up logic.
  - `business_model` has a `reading` status while their site is being read, so it isn't asked when a site is coming.
  - `tool` is known once any tool is named or connected. It is `unavailable` when `toolToAsk` finds nothing.
- **Invalid picks end the trail instead of triggering a retry**, to avoid a second model call. Invalid picks are the website, a second quick win, or a tool nobody needs. They are logged. There were 0 in the final run.
- **The cap counts answered items, the website included.** It was never reached in the final run; it was hit in every persona in the first iteration.
- **Metric definitions:**
  - `reaskedKnown` snapshots `known()` when the card's `data-question` chunk arrives. Background profile notes can land during the planner call, so a few counts may be "known by the time the card showed" rather than "known to the planner".
  - `stoppedEarly` treats "not sure" answers to the goal or target customer as settled.
  - `turnsToQuickWin` is the user turn whose reply carried `data-taskStarted`.

## Failure examples

The iterations were subset runs on 6 personas each: v1 was the first prompt, v2 grouped the items, v3 stopped relabeling chips and told the model to finish, and v4 framed the finish as a wrap-up. Examples 1–6 come from those iterations; the final run is clean on them.

1. **Never stopped, and asked filler questions.** In v1 every persona hit the 6-answer cap, with current_acquisition and constraints asked to people who had already answered everything that mattered. b_unsure ended its v2 run like this, after the READY line had been added:

   > Ploy asks: How do most of your patients find you today? … You: Not sure yet
   > Ploy asks: What's your biggest constraint right now? … You: Not sure yet

2. **Re-asked a known goal.** In v1 a_goal_first gave the goal ("cold outreach to HR leaders") in its first message. Card 6 was still "What's your main goal for the next few months?"
3. **Refined vague known answers.** In v2 c_no_site_customers had "dog owners" recorded from its description of the business. The planner still asked: "You said dog owners. Who's your best customer today?"
4. **Question didn't match its fixed chips.** In v4 b_unsure asked "What do you want a visitor to do first: book a call, sign up, or buy?" with goal-intent chips. The prompt now says to ask a question the options answer.
5. **Unsafe relabel.** Also in v2: a quick-win alt card showed the chip "Skip for now", which mapped to a real quick win (fixed, see above).
6. **Generic chips for what they sell.** In v1 d_bakery was offered "Products, one-time purchase" and similar chips, so the planner learned nothing. The prompt now asks for free text when nothing is known.
7. **Still in the final run: alt text doesn't match its chips.** a_social_link's alt card asked "Want 3 ready-to-post LinkedIn posts first?" but its chips were audit / cold email / lookalike. d_bakery (no site) was offered "a homepage audit" in the alt question while the chips showed a landing page. The quick-win options depend on the site, and the model's wording doesn't track them.
8. **Still in the final run: the fork is re-offered on most cards until a quick win starts.** There were 35 fork cards against 26 in the baseline, and c_unsupported_hiring saw it three times. This could feel pushy.

## Open issues

1. **Latency is the blocker.** Every turn after the website costs about 2–2.5s of Haiku time. The latency gates fail (next card p50 3.5s, chip tap p50 2.8s against 0.7s before). Options:
   - Use a faster model for the planner. gpt-4.1-mini measured 1–2s in a quick bench; its planning quality wasn't evaluated.
   - Shrink the output: have code write the alt card's text, and drop `hint`.
   - Start the model call while the quick win is being created. The prompt only needs the recipe.
   - Stream a provisional card.
   Pure chip-tap turns could also skip the model when the next item is obvious, but that re-introduces the state machine the spike removes.
2. **The tool question is never asked.** The stopping rule (goal + target + quick win running) always fires first. Tasks waiting on a tool drop to the end of the trail. Decide whether the tool is essential. If it is, add it to the readiness rule; that would cost about +1 card and bring the trail roughly back to the baseline's length.
3. **The alt quick-win card:**
   - Its wording doesn't track its code-supplied chips (failure 7). Code should write the alt question, or the prompt should show which options are on it.
   - It is re-offered on nearly every card (failure 8). Consider offering it at most once or twice.
4. Smaller issues:
   - Messages persisted with old slot names (`sell`, `followup`, `goal`, `quick_win`, `fork`) aren't migrated. Their pills show the raw slot, and `openQuestion` on an old in-progress trail may misread a fork. Anchors are mapped (`legacyAnchors`).
   - Changing an earlier answer on a finished trail re-runs the planner, which writes a second wrap-up message.
   - The UI wasn't checked visually; per the ground rules no dev server was started. `tsc`, `lint` and unit tests pass.
