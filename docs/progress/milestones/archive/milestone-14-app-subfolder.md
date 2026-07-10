# Milestone 14 - Move App Source Under `app/` (principal-directed)

Directed by the principal (2026-07-11): the entire app source lives in `app/`;
docs and compose-related files stay at root. Delete the throwaway `spike/`
(findings are preserved in `docs/spike/findings.md`).

- [x] **m14-01:** `git mv` the app parts (`package.json`, lockfile, `server/`, `web/`, `scripts/`, `Dockerfile`, `.dockerignore`) into `app/`, delete `spike/`, and point compose `build.context` at `./app`. (Verification: `./compose-helper.sh rebuild` → `/api/health` 200 and a real HTTP login against the rebuilt container)
- [x] **m14-02:** Confirm/fix the bootstrap scripts' root resolution from their new home. (Verification: `SECOND_BRAIN_WEB_DATA_DIR=<tmp> app/scripts/reset-auth.sh` prints credentials; `generate-deploy-key.sh` creates a key)
- [x] **m14-03:** Update README, `docs/deploy/*.md`, and AGENTS-PLAYBOOK for the `app/` layout (`cd app` for npm commands). (Verification: `grep -rn "cd app\|app/scripts" README.md AGENTS-PLAYBOOK.md docs/deploy/ | wc -l` > 0 and no stale root-relative `./scripts/` references remain in current-facing docs)
- [x] **m14-04:** Deliverable check: `cd app && npm run lint && npm test && npm run build` green, clean-slate compose cycle with login, dev-server boot from `app/`. (Verification: those commands, exercised for real)
