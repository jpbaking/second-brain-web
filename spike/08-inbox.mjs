// m00-08 part 3: end-to-end — process a dummy inbox file through the real
// /inbox.md workflow (app-side expansion), tools auto-approved.
// Throwaway spike code.
import { ClineCore } from "@cline/core";
import { readFile, readdir } from "node:fs/promises";

const BASE_URL = process.env.SPIKE_LMSTUDIO_URL ?? "http://localhost:1234/v1";
const MODEL_ID = process.env.SPIKE_MODEL_ID ?? "ornith-1.0-9b@q4_k_m";
const VAULT = process.cwd() + "/test-vault";
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now()-t0)/1000).toFixed(0)}s]`, ...a);

const workflow = await readFile(VAULT + "/.clinerules/workflows/inbox.md", "utf8");
const cline = await ClineCore.create({ clientName: "second-brain-web-spike", backendMode: "local" });
let resolveTurn;
cline.subscribe((e) => {
  if (e?.type === "agent_event") {
    const inner = e.payload?.event;
    if (inner?.type === "tool_start" || inner?.type === "tool_end") log(inner.type, JSON.stringify(inner.toolName ?? inner.name ?? inner).slice(0, 100));
    if (inner?.type === "error") log("agent error:", JSON.stringify(inner).slice(0, 200));
    if (inner?.type === "done" || inner?.type === "error") resolveTurn?.();
  }
  if (e?.type === "ended") resolveTurn?.();
});
setTimeout(() => { console.log("HARD TIMEOUT 480s"); process.exit(2); }, 480000);
const done = new Promise((r) => { resolveTurn = r; });
const started = await cline.start({
  prompt: `Run the following workflow now.\n\n${workflow}`,
  interactive: true,
  toolPolicies: {
    editor: { autoApprove: true }, bash: { autoApprove: true },
    search: { autoApprove: true }, fetch: { enabled: false },
  },
  config: {
    providerId: "lmstudio", modelId: MODEL_ID, baseUrl: BASE_URL,
    systemPrompt: "You are working in the principal's second-brain vault.",
    enableTools: true, enableSpawnAgent: false, enableAgentTeams: false,
    cwd: VAULT,
  },
});
await done;
await cline.stop(started.sessionId).catch(() => {});

const inbox = (await readdir(VAULT + "/inbox")).filter((f) => f !== "README.md");
const lib = await readdir(VAULT + "/library/2026").catch(() => []);
const catalog = await readFile(VAULT + "/library/2026/catalog.md", "utf8").catch(() => "");
log("inbox remaining:", JSON.stringify(inbox));
log("library/2026:", JSON.stringify(lib));
log("catalog mentions maya note:", /maya|drill|failover/i.test(catalog));
const pass = inbox.length === 0 && lib.some((f) => /maya|drill|failover/i.test(f));
console.log(pass ? "INBOX PROCESSING: PASS" : "INBOX PROCESSING: PARTIAL/FAIL");
process.exit(pass ? 0 : 1);
