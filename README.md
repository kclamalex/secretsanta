# Secret Santa

Create a Secret Santa session, let people join from their own browser with a session code, set "who can't get who" rules as admin, and draw names.

**Stack:** TypeScript end to end · Express 5 API · SQLite (Node's built-in `node:sqlite`) · React + Vite · Docker.

## Run it

```sh
make up          # build + run on http://localhost:3000
make up PORT=8080
make down        # stop (data is kept in the secretsanta-data volume)
make logs
```

`make` picks the container engine automatically: a running Docker daemon first (Docker Desktop, Colima, OrbStack), then Podman, then nerdctl. It starts Colima or the Podman machine if they're installed but stopped. Force one with `make up ENGINE=podman`.

Docker Compose works too: `docker compose up -d --build`.

## How it works

1. **Admin** creates a session on the home page and gets a 6-character code plus a private admin link (keep it; the admin token is stored in that browser).
2. **Participants** open the join link (the admin sends it with **Share invite…**, which opens the phone's share sheet) or enter the code, then type their name and optionally add a profile photo. Their browser remembers them.
3. **Admin** adds rules such as "Ann can't get Bob" (optionally both ways) and clicks **Draw names**. Joining and rule changes lock after the draw.
4. Each participant gets a wrapped gift to tap: it shakes, spins through everyone's faces, then lands on their match with confetti. They see only their own match. The admin can't see matches either. **Reset draw** reopens the session.

The draw uses bipartite matching, so it always finds a valid assignment when one exists and tells the admin when the rules make one impossible.

## Test mode

```sh
make test-mode        # separate container on localhost:3001 only, own data volume
make test-mode-down
```

Open `http://localhost:3001/test` (nothing links to it). It creates sessions with hundreds of fake people and random rules, runs thousands of simulated draws and checks each one, shows the saved draw with every match, and lets you "view as" any fake person to watch their reveal. The `/api/test/*` routes only exist when the server starts with `TEST_MODE=1`, they answer 404 to anything that isn't a direct connection from a private address (requests through a proxy or tunnel count as public), and they still need the session's admin token. Locally: `TEST_MODE=1 make dev`.

## Develop

Needs Node 24+.

```sh
npm install
make dev         # API on :3000, Vite on :5173 (proxies /api)
make test        # unit + API tests
npm run typecheck
```

| Path | What |
|---|---|
| `server/src/draw.ts` | Matching algorithm |
| `server/src/app.ts` | API routes |
| `server/src/db.ts` | SQLite schema |
| `web/src/App.tsx` | All pages: home, join, admin |
| `web/src/Reveal.tsx` | Full-screen match reveal |
| `web/src/Share.tsx` | Share-sheet invite button |
| `web/src/photo.ts` | Crops and shrinks photos before upload |

Environment: `HOST` (`0.0.0.0`), `PORT` (3000), `DB_PATH` (`data/secretsanta.db`, `/data/secretsanta.db` in Docker).
