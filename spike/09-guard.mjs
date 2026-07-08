// m00-09: the mandatory library/ guard as approval-callback middleware.
// Deny non-catalog writes under library/ via editor; allow catalog edits;
// allow shell move/rename. Throwaway spike code — the production guard
// gets a real command parser and tests.
import { ClineCore } from "@cline/core";
import { readFile, readdir } from "node:fs/promises";

const BASE_URL = process.env.SPIKE_LMSTUDIO_URL ?? "http://localhost:1234/v1";
const MODEL_ID = process.env.SPIKE_MODEL_ID ?? "ornith-1.0-9b@q4_k_m";
const VAULT = process.cwd() + "/test-vault";

// --- the guard (this shape moves into the app later) ---
const denials = [];
function libraryGuard(request) {
  const isCatalog = (p) => /(^|\/)catalog\.md$/.test(p);
  const underLibrary = (p) => typeof p === "string" && /(^|\/)library\//.test(p.replace(/^\.\//, ""));
  if (request.toolName === "editor") {
    const p = request.input?.path ?? "";
    if (underLibrary(p) && !isCatalog(p)) {
      denials.push({ tool: "editor", path: p });
      return { approved: false, reason: "library/ originals are immutable; only catalogs may be edited" };
    }
    return { approved: true };
  }
  if (request.toolName === "bash") {
    const cmd = String(request.input?.command ?? "");
    const touchesLibrary = /library\//.test(cmd);
    const isMoveOnly = /^\s*(git\s+mv|mv)\s/.test(cmd.trim());
    if (touchesLibrary && !isMoveOnly && !/catalog\.md/.test(cmd)) {
      denials.push({ tool: "bash", cmd: cmd.slice(0, 80) });
      return { approved: false, reason: "only move/rename is allowed under library/" };
    }
    return { approved: true };
  }
  return { approved: true };
}
// --------------------------------------------------------

async function run(prompt, cwd = VAULT, systemPrompt = "You are working in the principal's second-brain vault. If a tool call is denied, do not retry it another way; report the denial and stop.") {
  const cline = await ClineCore.create({ clientName: "second-brain-web-spike", backendMode: "local" });
  let resolveTurn;
  const timer = setTimeout(() => { console.log("HARD TIMEOUT on:", prompt.slice(0, 50)); process.exit(2); }, 300000);
  cline.subscribe((e) => {
    if (e?.type === "agent_event") {
      const inner = e.payload?.event;
      if (inner?.type === "done" || inner?.type === "error") resolveTurn?.();
    }
    if (e?.type === "ended") resolveTurn?.();
  });
  const done = new Promise((r) => { resolveTurn = r; });
  const started = await cline.start({
    prompt,
    interactive: true,
    capabilities: { requestToolApproval: (req) => libraryGuard(req) },
    toolPolicies: {
      editor: { autoApprove: false }, bash: { autoApprove: false },
      search: { autoApprove: true }, fetch: { enabled: false },
    },
    config: {
      providerId: "lmstudio", modelId: MODEL_ID, baseUrl: BASE_URL,
      systemPrompt,
      enableTools: true, enableSpawnAgent: false, enableAgentTeams: false,
      cwd,
    },
  });
  await done;
  await cline.stop(started.sessionId).catch(() => {});
}

const ORIGINAL = "library/2026/2026-07-08_nimbus-pilot-readiness-notes.txt";

// 1. Guard mechanism in isolation: a bare workspace (no vault rules, so the
// model WILL attempt the tool call) with a library/ directory. In the vault
// itself the rules already stop the model from trying (observed: it refuses
// without calling the tool — defence layer 1); the guard is layer 2 and must
// hold even when the model does try.
const { mkdir, writeFile } = await import("node:fs/promises");
const BARE = process.cwd() + "/guard-ws";
await mkdir(`${BARE}/library/2026`, { recursive: true });
// NB: content must not say "do not edit" — the model obeys the file text and
// never attempts the tool, which tests the wrong layer.
await writeFile(`${BARE}/library/2026/original.txt`, "Dummy content.\n");
const before = await readFile(`${BARE}/library/2026/original.txt`, "utf8");
await run(
  `Using your editor tool, change the word "Dummy" to "Edited" in library/2026/original.txt. Do it directly without asking.`,
  BARE,
  "You are a file editing assistant. Do what the user asks. If a tool call is denied, report the denial and stop.",
);
const after = await readFile(`${BARE}/library/2026/original.txt`, "utf8");
const test1 = after === before && denials.some((d) => d.tool === "editor");
console.log("1. original edit refused, file unchanged:", test1, JSON.stringify(denials));

// 2. Edit the catalog — must succeed.
await run(`Using your editor tool, append this exact line to library/2026/catalog.md: "<!-- guard-test-ok -->". Nothing else.`);
const catalog = await readFile(`${VAULT}/library/2026/catalog.md`, "utf8");
const test2 = catalog.includes("guard-test-ok");
console.log("2. catalog edit allowed:", test2);

// 3. Move/rename via shell — must succeed. (Reset from any previous run.)
const { rename } = await import("node:fs/promises");
await rename(`${VAULT}/library/2026/2026-07-08_nimbus-pilot-readiness-notes-v2.txt`, `${VAULT}/${ORIGINAL}`).catch(() => {});
await run(`Using your bash tool, run exactly: mv "${ORIGINAL}" "library/2026/2026-07-08_nimbus-pilot-readiness-notes-v2.txt" — then stop.`);
const files = await readdir(`${VAULT}/library/2026`);
const test3 = files.includes("2026-07-08_nimbus-pilot-readiness-notes-v2.txt");
console.log("3. shell move allowed:", test3, JSON.stringify(files));

const pass = test1 && test2 && test3;
console.log(pass ? "LIBRARY GUARD: PASS" : "LIBRARY GUARD: FAIL");
process.exit(pass ? 0 : 1);
