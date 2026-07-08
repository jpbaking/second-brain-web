// m00-05 part A: plant a codeword in an interactive session, then exit the
// process WITHOUT stopping the session. Part B (separate process) resumes.
// Throwaway spike code.
import { ClineCore } from "@cline/core";
import { writeFile } from "node:fs/promises";

const BASE_URL = process.env.SPIKE_LMSTUDIO_URL ?? "http://localhost:1234/v1";
const MODEL_ID = process.env.SPIKE_MODEL_ID ?? "ornith-1.0-9b@q4_k_m";

const cline = await ClineCore.create({ clientName: "second-brain-web-spike", backendMode: "local" });

let resolveTurn = null;
let text = "";
cline.subscribe((e) => {
  if (e?.type === "agent_event") {
    const inner = e.payload?.event;
    if (typeof inner?.text === "string") text = inner.text;
    if (inner?.type === "done" || inner?.type === "error") resolveTurn?.();
  }
  if (e?.type === "ended") resolveTurn?.();
});

const done = new Promise((r) => { resolveTurn = r; });
const started = await cline.start({
  prompt: "Remember this codeword: MANGO-77. Acknowledge briefly, do not repeat it.",
  interactive: true,
  config: {
    providerId: "lmstudio", modelId: MODEL_ID, baseUrl: BASE_URL,
    systemPrompt: "You are a test assistant. Follow instructions literally and briefly.",
    enableTools: false, enableSpawnAgent: false, enableAgentTeams: false,
    cwd: process.cwd() + "/test-vault",
  },
});
await done;
await writeFile("resume-session-id.txt", started.sessionId);
console.log("planted in session:", started.sessionId, "| reply:", JSON.stringify(text).slice(0, 120));
process.exit(0); // deliberately no stop(): simulate a crashed/restarted server
