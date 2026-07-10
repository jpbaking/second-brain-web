# Deploying second-brain-web

`second-brain-web` is a **single-user, self-hosted** web console. It is designed
to run as one container behind a TLS-terminating reverse proxy, with all state on
a single private data volume. There is no signup and no multi-user support — the
only unauthenticated routes are login, the setup status page, and static assets.

## 1. Build and run the container

For a local run, the repo ships a `docker-compose.yaml` plus
[compose-helper](https://github.com/jpbaking/compose-helper) — `cp .env.example
.env` then `./compose-helper.sh up` builds and starts the same image with the
data root on the `sbw-data` volume (see the README quick start). The rest of
this section shows the equivalent plain-`docker` commands for a hardened
deployment.

```bash
# Build the image (multi-stage: builds server + web, ships production deps only).
docker build -t second-brain-web .

# Run it with a durable named volume for the data root.
docker run -d --name second-brain-web \
  -p 127.0.0.1:8722:8722 \
  -v sbw-data:/data \
  -e SECOND_BRAIN_WEB_SECRETS_KEY="$(cat /path/to/secrets.key)" \
  second-brain-web
```

Publish the port to `127.0.0.1` only (as above) and let the reverse proxy reach
it locally — do not expose 8722 to the public network directly.

The container runs as the unprivileged `node` user and stores everything under
`/data`, which it requires to be private (`0700`). The image pre-creates the
volume mount point with the correct owner and mode.

## 2. Configuration (environment)

| Variable | Required | Default (image) | Purpose |
|---|---|---|---|
| `SECOND_BRAIN_WEB_DATA_DIR` | yes | `/data` | Private data root (db, indexes, ssh, auth, workspaces). Must be `0700`. |
| `SECOND_BRAIN_WEB_SECRETS_KEY` | for provider keys | — | AES-256-GCM key that encrypts stored provider API keys. Without it you cannot save a keyed provider profile. Keep it out of the image and out of version control. |
| `SECOND_BRAIN_WEB_HOST` | no | `0.0.0.0` | Bind address inside the container. |
| `SECOND_BRAIN_WEB_PORT` | no | `8722` | Listen port. |
| `SECOND_BRAIN_WEB_UPLOAD_MAX_BYTES` | no | `52428800` (50 MiB) | Max upload size. |
| `NODE_ENV` | no | `production` | In production, auth cookies are marked `Secure` — see HTTPS below. |

## 3. Reverse proxy and HTTPS

**HTTPS is required in production.** With `NODE_ENV=production` (the image
default) the session, challenge, and CSRF cookies are set `Secure`, so browsers
will only send them over HTTPS. Served over plain HTTP on a non-localhost host,
login will appear to "not stick" because the cookies are dropped. Cookies are
always `HttpOnly` and `SameSite=Lax`.

Terminate TLS at a reverse proxy and forward to the container. Point it at a
certificate from your own CA or Let's Encrypt.

### nginx

```nginx
server {
    listen 443 ssl;
    server_name brain.example.com;

    ssl_certificate     /etc/letsencrypt/live/brain.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/brain.example.com/privkey.pem;

    # Uploads default to 50 MiB; keep the proxy limit in step.
    client_max_body_size 50m;

    location / {
        proxy_pass         http://127.0.0.1:8722;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_set_header   X-Forwarded-For   $remote_addr;
    }
}
```

### Caddy

```
brain.example.com {
    reverse_proxy 127.0.0.1:8722
    request_body {
        max_size 50MB
    }
}
```

Caddy provisions and renews TLS automatically.

## 4. First-run owner setup

There is no signup. Create the single owner's credentials by running the
`reset-auth` CLI against the data volume, then read the one-time password and
TOTP setup URI it prints:

```bash
docker exec -it second-brain-web node server/dist/cli/reset-auth.js /data
```

This writes `auth/owner.json` (password hash + TOTP secret) into the data root.
Add the TOTP secret to your authenticator, then sign in with the printed
password and a current code. Re-running it rotates the credentials.

## 5. Vault SSH deploy key

The app clones/pulls your Second Brain vault over SSH using a dedicated deploy
key stored at `ssh/deploy_key` in the data root. The runtime image ships only
the built app (not `scripts/`), so generate the key from a repo checkout on the
host, pointed at the same data location. With a **bind-mounted** data directory:

```bash
# Run the container with a host directory instead of a named volume:
#   -v /srv/second-brain-web/data:/data
SECOND_BRAIN_WEB_DATA_DIR=/srv/second-brain-web/data ./scripts/generate-deploy-key.sh
```

Or generate an ed25519 key by hand into the data root:

```bash
install -d -m 700 /srv/second-brain-web/data/ssh
ssh-keygen -t ed25519 -N '' -f /srv/second-brain-web/data/ssh/deploy_key
chmod 600 /srv/second-brain-web/data/ssh/deploy_key
```

Add the printed public key (`deploy_key.pub`) as a **read/write deploy key** on
the vault's Git host, then set the vault remote URL in the app's Vault settings.

## 6. Updates

Rebuild the image and recreate the container; the data volume is untouched:

```bash
docker build -t second-brain-web .
docker rm -f second-brain-web
docker run -d --name second-brain-web -p 127.0.0.1:8722:8722 \
  -v sbw-data:/data -e SECOND_BRAIN_WEB_SECRETS_KEY="$(cat /path/to/secrets.key)" \
  second-brain-web
```

Database migrations run automatically at start-up. For backing up and restoring
the data volume, see [backup-restore.md](backup-restore.md).
```
