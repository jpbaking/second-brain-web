// m00-08: slash workflows are NOT expanded by @cline/core (verified: the
// model receives the literal "/spike-test.md"). This script proves the
// app-side fallback: read the workflow file, send its content as the prompt.
// Throwaway spike code.
import { ClineCore } from "@cline/core";
import { readFile } from "node:fs/promises";

const BASE_URL = process.env.SPIKE_LMSTUDIO_URL ?? "http://localhost:1234/v1";
const MODEL_ID = process.env.SPIKE_MODEL_ID ?? "ornith-1.0-9b@q4_k_m";
const VAULT = process.cwd() + "/test-vault";

// App-side expansion: what the web app's workflow shortcut will do.
const workflow = await readFile(VAULT + "/.clinerules/workflows/spike-test.md", "utf8");
const prompt = `Run the following workflow now.\n\n${workflow}`;

const cline = await ClineCore.create({ clientName: "second-brain-web-spike", backendMode: "local" });
let text = "";
let resolveTurn;
cline.subscribe((e) => {
  if (e?.type === "agent_event") {
    const inner = e.payload?.event;
    if (typeof inner?.text === "string") text = inner.text;
    if (inner?.type === "done" || inner?.type === "error") resolveTurn?.();
  }
  if (e?.type === "ended") resolveTurn?.();
});
setTimeout(() => { console.log("HARD TIMEOUT"); process.exit(2); }, 240000);
const done = new Promise((r) => { resolveTurn = r; });
const started = await cline.start({
  prompt,
  interactive: true,
  config: {
    providerId: "lmstudio", modelId: MODEL_ID, baseUrl: BASE_URL,
    systemPrompt: "You are a test assistant.",
    enableTools: false, enableSpawnAgent: false, enableAgentTeams: false,
    cwd: VAULT,
  },
});
await done;
await cline.stop(started.sessionId).catch(() => {});
console.log("reply:", JSON.stringify(text).slice(0, 200));
const pass = text.includes("WORKFLOW-ENGAGED-733");
console.log(pass ? "WORKFLOW EXPANSION: PASS" : "WORKFLOW EXPANSION: FAIL");
process.exit(pass ? 0 : 1);
