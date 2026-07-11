# Milestone 33 — configure prompts for the other .env settings

Principal-directed. `configure` currently writes only
`SECOND_BRAIN_WEB_SECRETS_KEY` into `.config/.env`; the other compose-substituted
vars (`SECOND_BRAIN_WEB_BIND`, `SECOND_BRAIN_WEB_PORT`,
`SECOND_BRAIN_WEB_NODE_ENV`) are left to their docker-compose defaults. Prompt
for them too, with sensible defaults and existing-value prefill on re-run.

Defaults / semantics (from `.env.example` + `docker-compose.yaml`):
- `SECOND_BRAIN_WEB_BIND` — host publish address, default `127.0.0.1`.
- `SECOND_BRAIN_WEB_PORT` — host port, default `8722` (1–65535).
- `SECOND_BRAIN_WEB_NODE_ENV` — `production` (default) or `development`
  (development drops the Secure cookie flag — plain-HTTP LAN only).

## Read before working

- `configure`, `configure.ps1` (keep behaviourally matched)
- `.env.example`, `docker-compose.yaml`

## Checklist

- [ ] **m33-01** bash `configure`: after the secrets key, prompt for bind, port
      (validated 1–65535, re-prompt in place), and a development-mode yes/no
      (maps to `SECOND_BRAIN_WEB_NODE_ENV`), each defaulting to the existing
      `.config/.env` value or the documented default. Write all four keys to
      `.config/.env`.
      Verify: scripted run asserts `.config/.env` contains the four keys with
      the entered bind/port and `SECOND_BRAIN_WEB_NODE_ENV=development`; a
      blank-input run yields the defaults; `bash -n configure`.

- [ ] **m33-02** Mirror the same prompts/validation/write in `configure.ps1`.
      Verify: structured parity review against the bash version (no pwsh on the
      host); principal runs on Windows.
