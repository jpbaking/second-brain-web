# Milestone 30: Onboarding / State checks on login

- [x] m30-01: Add a dedicated UI state for when no providers are configured. When authenticated but no providers exist, show an info/error page and restrict navigation to only "Sign Out". (Verify: `cd app && npm test --workspace web` / visual verification of UI state)
- [x] m30-02: Add a dedicated UI state for when a provider is configured but no vault exists. Route the user directly to the vault configuration page and restrict navigation to only that and "Sign Out". (Verify: `cd app && npm test --workspace web` / visual verification of UI state)
