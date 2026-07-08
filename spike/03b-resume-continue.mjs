// m00-05 part B: fresh process, resume the session planted by part A and
// ask for the codeword. Tries plain send() first; falls back to
// start({ initialMessages }) rehydration if the session isn't live-resumable.
// Throwaway spike code.
import { ClineCore } from "@cline/core";
import { readFile } from "node:fs/promises";

const BASE_URL = process.env.SPIKE_LMSTUDIO_URL ?? "http://localhost:1234/v1";
const MODEL_ID = process.env.SPIKE_MODEL_ID ?? "ornith-1.0-9b@q4_k_m";
const sessionId = (await readFile("resume-session-id.txt", "utf8")).trim();

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

const QUESTION = "What is the codeword I told you earlier? Reply with just the codeword.";
let path = "send";
try {
  const done = new Promise((r) => { resolveTurn = r; });
  await cline.send({ sessionId, prompt: QUESTION });
  await done;
} catch (err) {
  console.log("plain send failed:", err?.code ?? err?.message);
  path = "initialMessages";
  const prior = await cline.readMessages(sessionId);
  const messages = Array.isArray(prior) ? prior : prior?.messages;
  console.log("rehydrating with", messages?.length, "messages");
  const done = new Promise((r) => { resolveTurn = r; });
  await cline.start({
    prompt: QUESTION,
    interactive: true,
    initialMessages: messages,
    config: {
      providerId: "lmstudio", modelId: MODEL_ID, baseUrl: BASE_URL,
      systemPrompt: "You are a test assistant. Follow instructions literally and briefly.",
      enableTools: false, enableSpawnAgent: false, enableAgentTeams: false,
      cwd: process.cwd() + "/test-vault",
    },
  });
  await done;
}

const pass = text.includes("MANGO-77");
console.log("resume path:", path, "| reply:", JSON.stringify(text).slice(0, 150));
console.log(pass ? "RESUME: PASS" : "RESUME: FAIL");
process.exit(pass ? 0 : 1);
