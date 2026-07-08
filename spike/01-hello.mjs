// m00-02 verification: construct ClineCore, run one prompt against the
// local LM Studio endpoint, print the assistant's reply.
// Throwaway spike code — do not polish.
// Model per principal: ornith-1.0-9b@q4_k_m (reasoning model; needs token headroom).
import { ClineCore } from "@cline/core";
import { readFile } from "node:fs/promises";

// NB: the /v1 suffix is required — bare host:port makes the provider fail
// with "Model returned empty response".
const BASE_URL = process.env.SPIKE_LMSTUDIO_URL ?? "http://localhost:1234/v1";
const MODEL_ID = process.env.SPIKE_MODEL_ID ?? "ornith-1.0-9b@q4_k_m";

const cline = await ClineCore.create({
  clientName: "second-brain-web-spike",
  backendMode: "local",
});

const agentEventTypes = [];
let assistantText = "";
cline.subscribe((event) => {
  if (event?.type !== "agent_event") return;
  const inner = event.payload?.event;
  if (!inner) return;
  agentEventTypes.push(inner.type);
  if (typeof inner.text === "string") assistantText += inner.text;
  if (inner.type === "error") console.log("[agent error]", JSON.stringify(inner.error).slice(0, 300));
});

const result = await cline.start({
  prompt: "Reply with exactly this phrase and nothing else: HELLO FROM THE SPIKE",
  interactive: false,
  config: {
    providerId: "lmstudio",
    modelId: MODEL_ID,
    baseUrl: BASE_URL,
    systemPrompt: "You are a test assistant. Follow instructions literally and briefly.",
    enableTools: false,
    enableSpawnAgent: false,
    enableAgentTeams: false,
    cwd: process.cwd(),
  },
});

await new Promise((r) => setTimeout(r, 2000)); // let persistence flush
const persisted = JSON.parse(await readFile(result.messagesPath, "utf8"));
const lastAssistant = [...(persisted.messages ?? [])].reverse().find((m) => m.role === "assistant");

console.log("sessionId:", result.sessionId);
console.log("agent event types seen:", [...new Set(agentEventTypes)].join(", "));
console.log("assistant text (from events):", JSON.stringify(assistantText).slice(0, 200));
console.log("persisted message count:", persisted.messages?.length);
console.log("persisted assistant reply:", JSON.stringify(lastAssistant?.content).slice(0, 300));
process.exit(0);
