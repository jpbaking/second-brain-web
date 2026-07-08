// m00-06: does requestToolApproval pause a tool call, and can the decision
// be resolved asynchronously from another code path (like a web route)?
// Throwaway spike code.
import { ClineCore } from "@cline/core";
import { readFile, rm } from "node:fs/promises";
import { EventEmitter } from "node:events";

const BASE_URL = process.env.SPIKE_LMSTUDIO_URL ?? "http://localhost:1234/v1";
const MODEL_ID = process.env.SPIKE_MODEL_ID ?? "ornith-1.0-9b@q4_k_m";
const VAULT = process.cwd() + "/test-vault";
const TARGET = VAULT + "/inbox/approval-test.txt";
await rm(TARGET, { force: true });

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// Simulated "web route": pending approvals resolved from a timer loop,
// entirely outside the callback's synchronous context.
const approvalBus = new EventEmitter();
const pendingApprovals = new Set();
const scheduled = new Set();
setInterval(() => {
  for (const toolCallId of pendingApprovals) {
    if (scheduled.has(toolCallId)) continue;
    scheduled.add(toolCallId);
    setTimeout(() => approvalBus.emit("decision", { toolCallId, approved: true }), 3000);
  }
}, 250).unref();

const approvalLog = [];
const cline = await ClineCore.create({ clientName: "second-brain-web-spike", backendMode: "local" });

let resolveTurn = null;
cline.subscribe((e) => {
  if (e?.type === "agent_event") {
    const inner = e.payload?.event;
    if (inner?.type && inner.type !== "usage") log("event:", inner.type, inner.type === "tool_start" || inner.type === "tool_call" ? JSON.stringify(inner).slice(0, 160) : "");
    if (inner?.type === "error") log("agent error:", JSON.stringify(inner).slice(0, 250));
    if (inner?.type === "done" || inner?.type === "error") resolveTurn?.();
  }
  if (e?.type === "ended") resolveTurn?.();
});

const done = new Promise((r) => { resolveTurn = r; });
const startPromise = cline.start({
  prompt:
    "Create a file at inbox/approval-test.txt containing exactly the word: approved\n" +
    "Use your file editing tool. Do not do anything else, no filing, no log updates.",
  interactive: true,
  capabilities: {
    requestToolApproval: (request) => {
      approvalLog.push({ toolName: request.toolName, toolCallId: request.toolCallId });
      log("approval requested:", request.toolName, JSON.stringify(request.input).slice(0, 140));
      return new Promise((resolve) => {
        pendingApprovals.add(request.toolCallId);
        const onDecision = ({ toolCallId, approved }) => {
          if (toolCallId !== request.toolCallId) return;
          approvalBus.off("decision", onDecision);
          pendingApprovals.delete(toolCallId);
          log("approval resolved externally:", request.toolName, "->", approved);
          resolve({ approved });
        };
        approvalBus.on("decision", onDecision);
      });
    },
  },
  toolPolicies: {
    editor: { autoApprove: false },
    bash: { autoApprove: false },
  },
  config: {
    providerId: "lmstudio", modelId: MODEL_ID, baseUrl: BASE_URL,
    systemPrompt: "You are a test assistant. Follow instructions literally and briefly.",
    enableTools: true, enableSpawnAgent: false, enableAgentTeams: false,
    cwd: VAULT,
  },
});
startPromise.then(() => log("start() resolved")).catch((err) => { log("start() rejected:", err?.message); resolveTurn?.(); });

await done;

let fileContent = null;
try { fileContent = (await readFile(TARGET, "utf8")).trim(); } catch {}
const pass = approvalLog.length > 0 && fileContent !== null;
log("approvals requested:", JSON.stringify(approvalLog));
log("file content:", JSON.stringify(fileContent));
console.log(pass ? "APPROVAL: PASS" : "APPROVAL: FAIL");
process.exit(pass ? 0 : 1);
