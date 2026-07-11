# Milestone 32 — port configure.ps1 to the revamped bash configure

Principal-directed (BACKLOG item). Bring `configure.ps1` to full parity with the
milestone-31 bash `configure`:

1. Retry-in-place validation (never abort on a typo).
2. Provider + key entered first, then pick a model from the queried list (manual
   fallback when the query fails).
3. Generate the vault SSH deploy keypair; print the public key (also shown on
   the Vault page).
4. Write `.env`, `providers.yaml`, and `deploy_key`(+`.pub`) into `.config/`,
   with the legacy root `.env` migration prompt.

Constraint: no PowerShell (`pwsh`) on this Linux host, so functional execution
is verified by the principal on Windows. Here, verification is a structured
parity review against `configure` (the bash reference).

## Read before working

- `configure` (the bash reference — must stay behaviourally matched)
- `configure.ps1` (current state)
- `app/server/src/cli/list-models.ts`, `app/server/src/cli/encrypt-secret.ts`

## Checklist

- [x] **m32-01** Rewrite `configure.ps1` to mirror `configure`: `.config/`
      output (`.env` 600 intent, providers/key world-readable for the container
      mount), retry-in-place prompts, provider+key-first model picker via the
      `list-models` CLI with manual fallback, ed25519 keypair generation with
      the public key printed, and the legacy root-`.env` migration prompt.
      Verify: structured parity review — every prompt, validation loop, output
      file, and CLI bridge in `configure` has a matching construct in
      `configure.ps1` (table the mapping in the journal). Principal runs the
      script on Windows to confirm execution.

- [x] **m32-02** Long model lists: add a filter + pager to the picker in BOTH
      `configure` and `configure.ps1` — type a substring to narrow, page lists
      taller than the terminal, plus keep 'm' for manual entry.
      Verify (bash): scripted run against the stub with a filter narrowing a
      seeded multi-model list, then selecting; `bash -n configure`. (ps1): parity
      review — the filter/pager constructs match the bash version.
