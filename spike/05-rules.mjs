// m00-07: does the SDK auto-load .clinerules/ from the workspace?
// A/B: identical prompt + systemPrompt, cwd = test vault vs empty dir.
// Throwaway spike code.
import { ClineCore } from "@cline/core";
import { mkdir } from "node:fs/promises";

const BASE_URL = process.env.SPIKE_LMSTUDIO_URL ?? "http://localhost:1234/v1";
const MODEL_ID = process.env.SPIKE_MODEL_ID ?? "ornith-1.0-9b@q4_k_m";
await mkdir(process.cwd() + "/empty-ws", { recursive: true });

const PROMPT =
  "In one sentence: what is your role in this workspace, and what are your prime directives about files the principal provides?";

async function runIn(cwd) {
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
  const done = new Promise((r) => { resolveTurn = r; });
  const started = await cline.start({
    prompt: PROMPT,
    interactive: true,
    config: {
      providerId: "lmstudio", modelId: MODEL_ID, baseUrl: BASE_URL,
      systemPrompt: "You are a test assistant.",
      enableTools: false, enableSpawnAgent: false, enableAgentTeams: false,
      cwd,
    },
  });
  await done;
  await cline.stop(started.sessionId).catch(() => {});
  return text;
}

const inVault = await runIn(process.cwd() + "/test-vault");
console.log("IN VAULT:", JSON.stringify(inVault).slice(0, 400));
const inEmpty = await runIn(process.cwd() + "/empty-ws");
console.log("IN EMPTY:", JSON.stringify(inEmpty).slice(0, 400));

// Markers that only exist in .clinerules/00-role.md, not in the prompt:
const vaultWords = /executive secretary|library\/|second brain/i;
const pass = vaultWords.test(inVault) && !vaultWords.test(inEmpty);
console.log("vault persona in vault run:", vaultWords.test(inVault));
console.log("vault persona in empty run:", vaultWords.test(inEmpty));
console.log(pass ? "RULES AUTO-LOAD: CONFIRMED" : "RULES AUTO-LOAD: INCONCLUSIVE");
process.exit(0);
