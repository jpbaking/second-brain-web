# Phase 010 - DevOps, Proxy, And SSE Notes

## Intended Exposure Model

The app may be reachable through two paths:

- Local/private path through Nginx Proxy Manager.
- Public path through Cloudflare Tunnel with Cloudflare Access policies.

The app's own password + TOTP auth remains mandatory on every path. Cloudflare
Access is an additional outer gate, not a replacement for app auth.

## Realtime Decision

Use SSE first.

Rationale:

- The app primarily needs server-to-browser streaming: assistant text deltas,
  tool events, approval prompts, vault status, compaction events, and run
  completion.
- Browser-to-server actions can use ordinary authenticated HTTP POST requests.
- SSE is simpler than WebSocket through reverse proxies because it is a
  long-lived HTTP response, not an upgraded connection.
- WebSocket can be added later behind a transport abstraction if true
  bidirectional realtime becomes necessary.

## Route Shape

Recommended:

```text
GET  /api/sessions/:id/events      # SSE stream
POST /api/sessions/:id/messages    # user message
POST /api/approvals/:id            # approve/deny tool action
POST /api/sessions/:id/compact     # manual compaction
POST /api/uploads                  # inbox intake/upload
```

Use normal app session cookies for auth. Browser `EventSource` does not support
arbitrary custom request headers, so do not design SSE auth around custom
headers.

## SSE Server Requirements

SSE responses should include:

```http
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

Behaviour:

- Send event IDs with `id: <monotonic-id>`.
- Support reconnect with `Last-Event-ID`.
- Send heartbeat comments every 15-30 seconds, for example `: heartbeat`.
- Persist enough session events to replay missed events after reconnect.
- Treat dropped streams as normal; the browser should reconnect.

## Nginx Proxy Manager Notes

For the SSE route, add advanced Nginx config equivalent to:

```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
```

If a future WebSocket transport is added, enable WebSocket support in Nginx
Proxy Manager for the host and ensure the proxy forwards upgrade headers. SSE
does not require WebSocket upgrade handling.

Suggested NPM host considerations:

- Set upload/body size high enough for expected inbox uploads.
- Keep HTTPS enabled for local access if practical.
- Avoid caching app/API routes.
- Route only to the internal app service port.
- Do not expose the vault workspace or reports as static directories.

## Cloudflare Tunnel And Access Notes

Cloudflare Tunnel can front the same app endpoint, with Cloudflare Access as an
outer authentication layer.

Considerations:

- Keep app auth enabled behind Cloudflare Access.
- Cloudflare may close long-lived connections during edge restarts or idle
  periods; SSE reconnect and heartbeat are required.
- Public upload size limits may apply depending on Cloudflare plan/settings.
  Large uploads should eventually support chunking/resume or be done through the
  local NPM path.
- Cloudflare Access cookies and app auth cookies must both be allowed for the
  hostname.
- Do not rely on Cloudflare-only identity for app authorization.

## Transport Abstraction

Implement a small internal event transport boundary:

- `publishSessionEvent(sessionId, event)`
- `subscribeSessionEvents(sessionId, lastEventId)`
- `ack/replay` support where needed

The initial implementation uses SSE. A later WebSocket implementation should
reuse the same event model rather than changing agent/session internals.

## Operational Checks

Before considering deployment done:

- SSE stream connects through local NPM.
- SSE stream reconnects after a forced disconnect.
- SSE stream works through Cloudflare Tunnel and Access.
- Heartbeats are visible in browser/network diagnostics.
- Uploads respect NPM and Cloudflare size limits.
- Reports are served only through authenticated app routes.
- Static `/design/` assets load without exposing vault data.

