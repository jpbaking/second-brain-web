# Milestone 36 — Claude Code subscription provider

Principal direction: expose Cline SDK's built-in `claude-code` provider so the
web app can use a manually authenticated Claude Code CLI and its Pro/Max usage
allowance instead of an Anthropic API key.

- [ ] **m36-01 — Declarative provider/configurator support**
  - Accept `claude-code` in `providers.yaml` without a key or base URL.
  - Configure it with a manual model and print the post-save auth reminder.
  - Verify: `cd app && npm test --workspace server -- configure-lib.test.ts provider-provisioning.test.ts`

- [ ] **m36-02 — Cline SDK model mapping**
  - Map provisioned `claude-code` profiles to the SDK provider and keep the
    app's own tool/approval policy authoritative.
  - Verify: `cd app && npm test --workspace server -- agent-runner.test.ts agent-session.test.ts`

- [ ] **m36-03 — Runtime CLI and persistent authentication**
  - Install Claude Code in the image, persist its user configuration in the
    data volume, and add a single-argument `compose-helper.sh claude-auth`
    command that runs interactive login as the runtime user.
  - Verify: `bash -n compose-helper.sh && docker build -t second-brain-web app && docker run --rm second-brain-web claude --version`

- [ ] **m36-04 — Operator documentation and regression suite**
  - Document configure → rebuild/start → `claude-auth`, including subscription
    versus API billing and the container-local credential boundary.
  - Verify: `cd app && npm run lint && npm test && npm run build`

- [ ] **m36-05 — Clean-volume live smoke test**
  - Recreate the stack, confirm the profile provisions and CLI is callable,
    then pause for the principal's manual Claude login if authentication is
    absent; after login, verify a web chat reaches Claude Code.
  - Verify: `./compose-helper.sh down && ./compose-helper.sh rebuild && ./compose-helper.sh exec second-brain-web claude --version`
