// m00-04: can one session carry context across several user turns?
// Turn 1 plants a codeword; turns 2 and 3 depend on it.
// Throwaway spike code.
import { ClineCore } from "@cline/core";

const BASE_URL = process.env.SPIKE_LMSTUDIO_URL ?? "http://localhost:1234/v1";
const MODEL_ID = process.env.SPIKE_MODEL_ID ?? "ornith-1.0-9b@q4_k_m";

const cline = await ClineCore.create({ clientName: "second-brain-web-spike", backendMode: "local" });

let turnText = "";
let resolveTurn = null;
cline.subscribe((event) => {
  if (event?.type === "agent_event") {
    const inner = event.payload?.event;
    if (typeof inner?.text === "string") turnText = inner.text; // cumulative; keep last
    if (inner?.type === "done") resolveTurn?.();
    if (inner?.type === "error") { console.log("[agent error]", JSON.stringify(inner).slice(0, 200)); resolveTurn?.(); }
  }
  if (event?.type === "ended") resolveTurn?.();
});
const waitTurn = () => new Promise((r) => { resolveTurn = r; });

let done;
done = waitTurn();
const started = await cline.start({
  prompt: "Remember this codeword: PLUM-42. Acknowledge briefly, do not repeat it yet.",
  interactive: true,
  config: {
    providerId: "lmstudio", modelId: MODEL_ID, baseUrl: BASE_URL,
    systemPrompt: "You are a test assistant. Follow instructions literally and briefly.",
    enableTools: false, enableSpawnAgent: false, enableAgentTeams: false,
    cwd: process.cwd() + "/test-vault",
  },
});
await done;
console.log("turn1:", JSON.stringify(turnText).slice(0, 150));

turnText = ""; done = waitTurn();
await cline.send({ sessionId: started.sessionId, prompt: "What is the codeword I told you? Reply with just the codeword." });
await done;
const turn2 = turnText;
console.log("turn2:", JSON.stringify(turn2).slice(0, 150));

turnText = ""; done = waitTurn();
await cline.send({ sessionId: started.sessionId, prompt: "Now write that same codeword in lowercase, nothing else." });
await done;
const turn3 = turnText;
console.log("turn3:", JSON.stringify(turn3).slice(0, 150));

await cline.stop(started.sessionId).catch(() => {});
const pass = turn2.includes("PLUM-42") && turn3.toLowerCase().includes("plum-42");
console.log(pass ? "MULTI-TURN: PASS" : "MULTI-TURN: FAIL");
process.exit(pass ? 0 : 1);
