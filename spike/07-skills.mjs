// m00-08 part 2: are .cline/skills/ visible to the agent as a skills tool?
// Throwaway spike code.
import { ClineCore } from "@cline/core";

const BASE_URL = process.env.SPIKE_LMSTUDIO_URL ?? "http://localhost:1234/v1";
const MODEL_ID = process.env.SPIKE_MODEL_ID ?? "ornith-1.0-9b@q4_k_m";
const VAULT = process.cwd() + "/test-vault";

const cline = await ClineCore.create({ clientName: "second-brain-web-spike", backendMode: "local" });
let text = "";
let resolveTurn;
const toolCalls = [];
cline.subscribe((e) => {
  if (e?.type === "agent_event") {
    const inner = e.payload?.event;
    if (typeof inner?.text === "string") text = inner.text;
    if (inner?.type?.startsWith("tool")) toolCalls.push(JSON.stringify(inner).slice(0, 120));
    if (inner?.type === "done" || inner?.type === "error") resolveTurn?.();
  }
  if (e?.type === "ended") resolveTurn?.();
});
setTimeout(() => { console.log("HARD TIMEOUT"); process.exit(2); }, 240000);
const done = new Promise((r) => { resolveTurn = r; });
const started = await cline.start({
  prompt: "List the names of the skills available to you in this workspace. Reply with only the skill names, one per line. If you have no skills capability, reply exactly: NO-SKILLS",
  interactive: true,
  config: {
    providerId: "lmstudio", modelId: MODEL_ID, baseUrl: BASE_URL,
    systemPrompt: "You are a test assistant.",
    enableTools: true, enableSpawnAgent: false, enableAgentTeams: false,
    cwd: VAULT,
  },
});
await done;
await cline.stop(started.sessionId).catch(() => {});
console.log("tool events:", toolCalls.slice(0, 5));
console.log("reply:", JSON.stringify(text).slice(0, 400));
const known = ["performance-evaluation", "interview-debrief", "report-builder"];
const hits = known.filter((k) => text.includes(k));
console.log("known skills mentioned:", hits.join(", ") || "(none)");
console.log(hits.length >= 2 ? "SKILLS: VISIBLE" : "SKILLS: NOT PROVEN");
process.exit(0);
