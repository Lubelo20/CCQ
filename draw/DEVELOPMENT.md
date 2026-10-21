# Developer notes

## Request flow

Browser → `/api/draw` → validated application logic → repository → database.

`createHandler(repositoryFactory, options)` accepts a repository factory (sync or async). Options include `configured` for local storage, `storage` for connection labels, and `env` for isolated tests. Production uses the async Neon repository; the development server injects a persistent SQLite repository only when `STORAGE=local`. The Neon driver is dynamically imported, so local mode and tests can run without installing external packages.

## API

JSON responses use `Cache-Control: no-store`. Mutations require a same-host Origin; authenticated browser requests send their session cookie automatically.

| Method | Route | Behaviour |
| --- | --- | --- |
| GET | /api/draw | Public fields; full records for signed-in organisers; X-Draw-Storage header |
| GET | /api/draw?action=session | Authentication/configuration/storage status (no connectivity check) |
| GET | /api/draw?action=health | Checks storage by reading records; no records returned |
| POST | /api/draw?action=login | Password login; sets signed 30-day cookie |
| POST | /api/draw?action=logout | Clears session cookie |
| POST | /api/draw | Creates organisation; returns 201 |
| PUT | /api/draw?id=UUID | Updates organisation; returns 200 |
| DELETE | /api/draw?id=UUID | Permanently deletes organisation; returns 200 |
| POST | /api/draw?action=attend&id=UUID | Ticks or unticks one golfer's attendance: `{"group":0,"player":2,"attended":true}` (zero-based); returns the entry |

Example create body:

```json
{
  "organisation": "Example organisation",
  "bookings": 1,
  "groups": [{"tee": "1A", "players": ["Player One", "", "", ""]}],
  "payment": "pending",
  "amount": null,
  "notes": "Private organiser note"
}
```

The dashboard includes the last loaded `updated_at` ISO timestamp in update/delete bodies. Repositories compare the version atomically and return a `409` with `code: "STALE_ENTRY"` on conflict. Legacy API clients that omit a version use unconditional writes. PostgreSQL timestamps are normalized to milliseconds and compared at that precision; each write advances the timestamp by at least a millisecond.

Attendance lives inside each group as `attended`, four booleans matching `players` (absent means nobody ticked), so it needs no schema change. It is organiser-only: the public GET strips it. The attend action updates one flag atomically and leaves `updated_at` alone, so organisers ticking side by side never overwrite each other or invalidate an open editor. Edits through PUT keep ticks with their golfer slot.

Payment values: `pending`, `paid`, `awaiting`, `invoice-details`. Exactly four player strings per group; blanks mean unknown. Amount is total booking value in ZAR, allows two decimal places, and is separate from payment status. Starting-hole labels are case-normalized and must be 1–18 with optional A/B. `1`, `1A` and `1B` reserve distinct labels; the club approves physical allocation conventions.

Status codes: 400 invalid input, 401 sign-in required/incorrect password, 403 rejected Origin, 404 missing entry, 405 unsupported method/action, 409 reservation/stale-record conflict, 429 login throttled, 503 missing configuration/storage health failure, 500 storage failure. Local server also rejects malformed JSON (400), payloads over 20 KB (413), and non-JSON request bodies (415). No raw storage errors or credentials are exposed.

## Storage and security

SQLite wraps saves/reservations in `BEGIN IMMEDIATE` transactions. Failed reservations roll back the entire entry change. Deleting entries cascades reservations. Seeding records and setting its marker is atomic and performed only once.

PostgreSQL uses a trigger-maintained tee reservation table with a primary key; duplicate assignments are rejected even with concurrent requests. The migration rebuilds reservations in a transaction. Do not write to the reservation table directly. Future schema changes need explicit tracked ALTER migrations.

Cookies contain a signed expiry, random nonce, and keyed password fingerprint. Rotating either password or signing secret revokes existing cookies. Logout expires the browser cookie. There is no central session table, so copied cookies remain valid until expiry or credential rotation. Throttling is per process; use Vercel Firewall for distributed protection.

## Verification

Run `npm run check` and `npm test`. Tests use temporary files/in-memory repositories and exercise the actual local server request pipeline with streams, so they work in environments that prohibit port binding.

For browser testing on a machine allowing localhost listeners:

1. Run `npm run dev`; sign in with the generated `.env.local` password.
2. Add a test organisation; fill all four golfers and assign a hole.
3. Refresh the public page and verify the group is ready, with no payments or notes.
4. Assign the same hole to another booking and verify the error leaves data unchanged.
5. Open the same booking in two browser sessions. Save one; saving the old version in the other should conflict.
6. Export filtered CSV and check all four names and amount/status fields.
7. Delete the test booking and verify its hole can be reused. Sign out and check mutations fail.
8. Check desktop/mobile layouts, keyboard focus, empty searches, connection failure messaging and printing.

Repeat migration, seeding, CRUD/conflict/privacy checks against a real Neon development branch before deploying. A green local connection status is evidence of local storage only, not Neon verification.
