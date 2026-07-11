# Backup and restore

Runtime state lives under the data root (`/data` in the container). Deployment
configuration (`.env` and `providers.yaml`) lives outside the volume and must
be backed up separately.

## What is in the data root

| Subdirectory | Contents | Recoverable without a backup? |
|---|---|---|
| `db/` | Core SQLite (`app.sqlite`): owner auth references, sessions, chat history, derived provider cache, vault config. | No — back this up. |
| `auth/` | `owner.json`: Argon2id password hash + TOTP secret encrypted with `SECOND_BRAIN_WEB_SECRETS_KEY`. | No — back this up with the secrets key (or re-run `reset-auth`). |
| `ssh/` | `deploy_key` used to clone/pull the vault. | Regenerable, but you must re-add the new public key to the Git host. |
| `workspaces/` | The Second Brain vault checkout (a Git clone). | Re-clonable from the remote, minus any uncommitted local changes. |
| `indexes/` | `vault.sqlite`: FTS search index + link graph. | Yes — a **rebuildable cache**. Reindex from the Search screen after a restore. You may exclude it from backups. |

> The `SECOND_BRAIN_WEB_SECRETS_KEY` is **not** stored in the data root — it is
> stored in the data root. Back up `.env` and `providers.yaml` together and
> securely: YAML ciphertext is bound to that exact key. If either is lost,
> provider keys must be re-entered through `./configure`.

## Back up the volume

Stop the container first for a consistent SQLite snapshot, then tar the volume
with a throwaway container:

```bash
docker stop second-brain-web

docker run --rm \
  -v sbw-data:/data \
  -v "$PWD":/backup \
  alpine tar czf /backup/sbw-data.tgz -C /data .

docker start second-brain-web
```

Store `sbw-data.tgz` off-host alongside protected copies of `.env` and
`providers.yaml`.
To skip the rebuildable cache, add `--exclude=./indexes` to the `tar` command.

## Restore into a fresh volume

Extract the archive into a new (or emptied) volume, then repair ownership and
the private mode the app requires:

```bash
docker volume create sbw-data-restored

docker run --rm \
  -v sbw-data-restored:/data \
  -v "$PWD":/backup \
  alpine sh -c 'cd /data && tar xzf /backup/sbw-data.tgz && chown -R 1000:1000 /data && chmod 700 /data'
```

`1000:1000` is the `node` user the container runs as; `0700` on the data root is
required or the app refuses to start.

## Boot against the restored data root

```bash
docker run -d --name second-brain-web \
  -p 127.0.0.1:8722:8722 \
  -v sbw-data-restored:/data \
  -e SECOND_BRAIN_WEB_SECRETS_KEY="$(cat /path/to/secrets.key)" \
  second-brain-web
```

Confirm it came up:

```bash
curl -s http://127.0.0.1:8722/api/health   # -> {"status":"ok"}
```

Database migrations run automatically at start-up, so a backup from an older
schema is upgraded on first boot. If you excluded `indexes/`, open the Search
screen and press **Reindex** to rebuild the search index and link graph.

This exact backup → restore → boot cycle is exercised as part of milestone 12
verification.
