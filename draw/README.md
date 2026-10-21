# CCQ Golf Draw

Public golf draw and organiser workspace for the CCQ Fundraising Golf Day (3rd Edition), hosted by the Congregational Church of Queensburgh: Friday 23 October 2026, Amanzimtoti Golf Course, 11h00 tee-off, Betterball, R2 000 per four-ball. Copied from the Icebolethu golf draw and rebranded; the Icebolethu project is untouched. The draw starts empty: organisers add organisations, golfers and starting holes from `/admin`. Plain HTML, CSS and browser JavaScript; Node.js API. Persistent SQLite for local development, Neon PostgreSQL for Vercel deployment. No frontend build step.

## Run locally

Requires Node.js **22.13 or later** (Node 24 LTS recommended).

```sh
npm run dev
```

On the first run, when no environment is configured, the app creates a private `.env.local` with `STORAGE=local` and random organiser credentials. Local development uses Node's built-in SQLite; it does not need npm dependencies or a Neon account. It starts with an empty draw and stores changes in `.data/draw.sqlite`. A seed marker prevents restarting from resetting edits or recreating deleted records.

- Public draw: http://localhost:3000
- Organiser sign-in: http://localhost:3000/admin
- Read-only design preview: http://localhost:3000/admin?preview=1

Use the `ADMIN_PASSWORD` from `.env.local` to sign in. Keep this file private; both `.env.local` and `.data/` are ignored by Git. Changing the password or session secret revokes existing sessions. Set `PORT` to change the local port. Restart after changing environment variables. Local storage is clearly labelled in the interface and never used by the Vercel function.

If `.env.local` already exists, the app preserves it. To select local development manually, set `STORAGE=local`, `ADMIN_PASSWORD` (at least 16 characters), and `SESSION_SECRET` (at least 32 characters). `npm run setup:local` creates credentials only when no configuration already exists.

## What works

The public draw searches organisations, golfers, and starting holes, filters assigned/pending groups, prints the current filtered draw, and refreshes automatically once per minute while visible. Loading failures retain the last loaded live data with a warning; first-load failures show a labelled saved snapshot of the draw.

The dashboard adds/edits/deletes organisations, maintains 1–8 groups of exactly four golfer slots, reserves starting holes, records payment status/amounts/private notes, filters bookings, and exports filtered records to CSV. It shows draw readiness and recorded paid totals; unknown amounts are excluded. CSV booking amounts repeat for each group and must not be summed as per-group amounts.

Both backends reject duplicate starting-hole labels transactionally. The dashboard submits record versions to detect stale edits/deletions and prevent overwriting another organiser's changes. Deletion requires confirmation and permanently releases the group's starting-hole reservations.

## Connect Neon

For a deployed site, or local testing against PostgreSQL:

1. Install dependencies with `npm ci`.
2. Create a Neon database and copy its PostgreSQL connection string.
3. Set these values in `.env.local` for development, and in Vercel for deployment:

| Variable | Purpose |
| --- | --- |
| STORAGE | Set to `neon` for local PostgreSQL development. Vercel always uses Neon. |
| DATABASE_URL | Neon PostgreSQL connection string, preserving supplied SSL parameters |
| ADMIN_PASSWORD | Random shared organiser password, at least 16 characters |
| SESSION_SECRET | Random cookie-signing secret, at least 32 characters |

4. Apply the schema and initial bookings to the intended branch:

```sh
npm run db:migrate
npm run db:seed
npm run db:check
npm run dev
```

Use a Neon development branch while building. Vercel deployments do not run migrations automatically. Local SQLite edits are not automatically copied to Neon; the two databases are separate.

## Deploy on Vercel

Import this directory as the project root. Framework: **Other**. Install command: `npm ci`. Build command: empty. Output directory: `public`. `vercel.json` routes `/admin` and applies security headers. `/api/draw.js` is the Node Vercel Function. Configure the three secrets above, run migrations/seed against the intended Neon branch, and check `/api/draw?action=health` for a successful real storage read.

Sessions use signed HttpOnly SameSite=Strict cookies for 30 days, with Secure on Vercel. Self-hosted HTTPS can set `COOKIE_SECURE=1`. Mutations require a same-host Origin. Login limits five failed attempts per IP per 15-minute window **per process**; configure Vercel Firewall rate limits for distributed enforcement. This is a shared-password workspace with no individual accounts, role management, password recovery, or audit log.

## Commands

```sh
npm run dev          # Start app; set up persistent local storage if unconfigured
npm run setup:local  # Create private local credentials if no configuration exists
npm run check        # JavaScript syntax checks
npm test             # API, request pipeline, persistence, and transaction tests
npm run db:migrate   # Apply PostgreSQL schema to DATABASE_URL
npm run db:seed      # Import original bookings into PostgreSQL once
npm run db:check     # Read-only PostgreSQL connection and record count check
```

Tests use temporary SQLite databases and injected repositories. They verify login, signed sessions, password rotation, origin checks, request parsing/limits, CRUD, private-field redaction, stale updates/deletions, tee conflicts and rollback, seed idempotence, storage persistence, rate limiting, and validation. The request pipeline is exercised through Node streams, without opening a network port. A real Neon connection and deployed browser smoke test are still required for production verification.

## Files

| File/folder | Purpose |
| --- | --- |
| public/index.html, public/draw.js | Public draw and automatic refresh |
| public/admin.html, public/admin.js | Login, dashboard, booking dialogs, CSV |
| public/ui.js | Shared interface utilities |
| public/golfday.css, public/admin.css | Public draw and organiser styling, matching the golfers' guide |
| public/fonts.css, public/fonts/ | Self-hosted Playfair Display and Montserrat (the CSP blocks external fonts) |
| public/countdown.js | Hero countdown to registration |
| public/draw.json | Public-only snapshot of the draw (21 October 2026), shown if the live draw can't load |
| public/assets/golfday/ | CCQ logo (cut from the client's flyer) and photography shared with the guide |
| public/assets/logos/, public/logos.js | Organisation logos for draw cards (none yet; initials are shown) |
| api/draw.js | Validation, authentication, throttling, status and CRUD API |
| lib/database.js | Parameterized Neon queries, optimistic concurrency |
| lib/local-database.js | Transactional persistent local SQLite repository |
| db/schema.sql | PostgreSQL schema and unique tee reservation trigger |
| scripts/ | Local setup, PostgreSQL migration/seed/connection checks |
| seed.json | Initial draw (exported 21 October 2026) for `npm run db:seed`; never served publicly |
| tests.mjs, tests/ | Automated backend and request pipeline tests |
| dev.mjs | Local static/API server with security headers |

## Event details

From the client's flyer (21 October 2026): Friday 23 October 2026, Amanzimtoti Golf Course, 11h00 tee-off, Betterball, R2 000 per four-ball including green fees, halfway house, prize-giving and dinner. RSVP Queen Mtshali, 065 169 9788. The guide and link-preview images assume `ccq-golf-draw.vercel.app` (draw) and `ccq-golf-day.vercel.app` (guide); update the URLs in `public/index.html` and `public/admin.html` if the Vercel projects get other names. Starting holes accept 1–18 with optional A/B, plus an optional HH:MM tee time. The event is a two-tee start (1st and 10th tees at ten-minute intervals), so a hole can be reused at different times; a hole and time together can only be reserved once. Run `npm run db:migrate` on Neon after pulling this change, as the reservation check and trigger changed.

Deploy as a new Vercel project with its own Neon database and new `ADMIN_PASSWORD` / `SESSION_SECRET`; never reuse the Icebolethu database or credentials.
