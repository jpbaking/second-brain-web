# Milestone 21 — Dedicated bare-metal system user

Directed by the principal (2026-07-11): take the next recommended backlog
item. Harden the non-container production path so the Cline runtime cannot
merge the interactive operator's global skills or rules into agent sessions.
Container deployments already satisfy this boundary through `USER node`.

- [ ] **m21-01:** Add a production systemd unit that runs as the dedicated `second-brain-web` user, uses a private system-managed state directory, reads secrets from a root-owned environment file, and isolates access to interactive users' homes. (Verification: `systemd-analyze verify docs/deploy/second-brain-web.service` plus assertions for `User`, `StateDirectory`, `ProtectHome`, `EnvironmentFile`, and loopback binding)
- [ ] **m21-02:** Document first install, owner/deploy-key bootstrap, service operation, and upgrades for the dedicated-user path; verify the service contract and the full application gate. (Verification: documentation/service grep assertions plus `cd app && npm run lint && npm test && npm run build`)
