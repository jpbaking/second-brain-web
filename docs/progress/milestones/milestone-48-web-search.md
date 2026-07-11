# Milestone 48: Web Search Tools (SearXNG)

Give the chat agent `web__search` and `web__fetch` tools backed by a
self-hosted SearXNG container, wired in as a stdio MCP server that the Cline
SDK auto-loads from `cline_mcp_settings.json`.

- [x] m48-01 Add a `searxng` service to `docker-compose.yaml` (internal only,
      JSON format enabled via mounted `settings.yml`) and point the app at it
      with `SECOND_BRAIN_WEB_SEARXNG_URL`. Verify: compose config parses
      (`docker compose config`).
- [x] m48-02 Implement `server/src/agent/web-tools-mcp.ts` — a stdio MCP
      server exposing `search` (SearXNG JSON query) and `fetch` (HTTP GET +
      HTML→text extraction, size/time caps). Verify: unit tests for result
      formatting and HTML extraction pass.
- [ ] m48-03 Register the MCP server in the Cline settings file
      (`<dataDir>/sessions/settings/cline_mcp_settings.json`) when
      `SECOND_BRAIN_WEB_SEARXNG_URL` is set; remove/disable when unset.
      Verify: unit test on the settings writer.
- [ ] m48-04 Auto-approve the read-only `web__search` / `web__fetch` tools in
      `tool-policy.ts`. Verify: policy unit tests.
- [ ] m48-05 Full suite green: `npm run lint && npm run build && npm test`
      from `app/`. Live check via `./compose-helper.sh up` (principal).
