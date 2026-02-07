# Deploy Notes

Last updated: 2026-02-07

## Overview

This deployment serves FrisQueendom at:

- `https://fqd.penguins.fg-goose.online`
- Controller page: `https://fqd.penguins.fg-goose.online/controller.html`
- LAN relay websocket: `wss://fqd.penguins.fg-goose.online/ws`

## Local Build

From repo root:

```bash
npm install
npm run typecheck
npm run build
```

This produces:

- `dist/index.html` (main game)
- `dist/controller.html` (remote controller)
- `dist/assets/*`

## Server Runtime Layout

Host: `penguins.fg-goose.online`

Paths:

- Static site: `/srv/fqd/site`
- Relay service code: `/srv/fqd/service/lan-relay.cjs`
- systemd unit: `/etc/systemd/system/fqd-lan-relay.service`
- Caddy config: `/etc/caddy/Caddyfile`

## Service Setup (Current)

`fqd-lan-relay.service`:

- Runs as `ubuntu`
- Starts command: `/usr/bin/node /srv/fqd/service/lan-relay.cjs`
- Binds relay on `127.0.0.1:8787`
- Health endpoint: `http://127.0.0.1:8787/health`

## Caddy Setup (Current)

Caddy site block for `fqd.penguins.fg-goose.online`:

- Reverse proxy `@relay` requests for `/ws` to `127.0.0.1:8787`
- Serves static files from `/srv/fqd/site`
- `file_server` enabled
- `encode zstd gzip` enabled

## Deploy Procedure

1. Build locally.
2. Sync static files:

```bash
rsync -az --delete dist/ penguins.fg-goose.online:/srv/fqd/site/
```

3. Sync relay service:

```bash
scp server/lan-relay.cjs penguins.fg-goose.online:/srv/fqd/service/lan-relay.cjs
```

4. Restart relay:

```bash
ssh penguins.fg-goose.online 'sudo systemctl restart fqd-lan-relay.service'
```

5. Verify relay health:

```bash
ssh penguins.fg-goose.online 'curl -sS http://127.0.0.1:8787/health'
```

6. Verify public pages:

```bash
curl -I https://fqd.penguins.fg-goose.online
curl -I https://fqd.penguins.fg-goose.online/controller.html
```

## Operational Checks

Relay status:

```bash
ssh penguins.fg-goose.online 'sudo systemctl status fqd-lan-relay.service --no-pager -l'
```

Relay logs:

```bash
ssh penguins.fg-goose.online 'sudo journalctl -u fqd-lan-relay.service -n 100 --no-pager'
```

Caddy status:

```bash
ssh penguins.fg-goose.online 'sudo systemctl status caddy --no-pager -l'
```

## Notes / Caveats

- Relay is intentionally Node 12 compatible (`.cjs`, no optional chaining, no `node:` import prefix) because this host currently has Ubuntu-packaged Node 12.
- `curl https://.../ws` returns `404` by design unless a websocket upgrade is performed. Use a websocket client for functional checks.
- For lowest latency on a local network, prefer running a LAN relay on a local machine and pointing the game to `ws://<local-ip>:8787/ws`.

## Rollback

1. Re-sync prior known-good `dist/`.
2. Re-sync prior known-good relay file.
3. Restart `fqd-lan-relay.service`.
4. Restore previous Caddy config if needed (backup is created before edits), then:

```bash
ssh penguins.fg-goose.online 'sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy'
```
