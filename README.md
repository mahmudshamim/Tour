# Tour — TerraExplore

Mobile-first tour planner with shared **group expense tracking**, built with Next.js.
One app for every tour: each one has its own people, money, places, look and link.

## Features
- **Tours hub** — the tour that's on now up top, other planned tours below, and
  past tours kept by year with their final numbers
- **Every tour is its own** — destination, starting point, dates, cover emoji,
  colour, tagline, distance/travel time, currency; its own people, expenses,
  history and places. No cover picked? One is chosen from the place
  ("Sylhet" → tea leaves over a tea-garden scene, "Cox's Bazar" → waves).
  No dates? They're read off the first and last expense.
- **Tour photos** — pick one from the phone's gallery (shrunk on the phone to
  ~100–300 KB, kept for offline use). Tea-garden tours (Sylhet, Srimangal) get a
  built-in photo until you add your own
  ([`public/covers/tea.jpg`](public/covers/tea.jpg), Unsplash License).
- **Share a tour** — every tour has its own link (`/?trip=<id>`); anyone with it can view
- **Edit lock** — viewing is open, editing needs a password, checked by the
  database (see below)
- Overview with budget ring, countdown ("In 12 days" / "Day 2 of 4"), next stop
- Map & Trip Plan (route visual + places checklist)
- **Expenses & group balances** — split from the pool, charge one person, or log
  **own-pocket** spend that never touches the group's money. Each expense has
  its own date & time (editable — log a no-signal day later, on the right day),
  and an icon that fits its name (Bus, চা, Kacci, নৌকা…)
- Full **activity history** — every add/edit/delete recorded
- **Works offline** — every write is queued in a durable outbox and flushed when
  the network returns; installable as a PWA
- Light (default white) + dark theme

## Edit lock
Anyone with the link can view every tour. Adding or changing anything needs the
edit password — tap the lock icon in the header.

This is enforced by Supabase, not just hidden in the UI: after
[`supabase-edit-lock.sql`](supabase-edit-lock.sql) runs, the tables are
read-only for the public key, and every write goes through one database
function (`terra_apply`) that first checks a session token. A token comes from
`terra_login(password)`; the password itself is only stored as a bcrypt hash in
a private schema the API can't reach, and never appears in the app's code.

- **Set or change the password** (Supabase SQL editor):
  `select terra_private.set_password('new-password');` — this also signs every
  device out. Editors can change it in the app too (Settings → Password).
- **Sign every device out:** Settings → Sign out all devices.
- **Brute-force guard:** after 20 wrong guesses in 15 minutes, logins pause for
  15 minutes (devices already unlocked keep working). To clear it early:
  `delete from terra_private.login_fails where at is not null;`
- Edits made offline on an unlocked device are queued and saved when the network
  is back. If that device was signed out meanwhile, they wait for the next unlock.

## Offline
Built for tours with no network. Open the site (or the installed app) once
with signal and everything works offline after that:

- **The app itself** — the service worker ([`public/sw.js`](public/sw.js))
  caches every file on the very first visit, not just the second.
- **Every tour's data** — not only the open one: a copy of each tour is
  refreshed in the background, so switching tours and the Tours hub work
  with no signal.
- **Editing** — unlocking needs the network once; the device then stays
  unlocked offline (until someone locks it or changes the password). Unlock
  before you leave.
- On iPhone, use *Add to Home Screen* — Safari may clear storage of sites
  that aren't installed.
- The service worker only runs in production builds (`pnpm build && pnpm
  start`, or the deployed site), not in `pnpm dev`.

Writes never go straight to Supabase. They land in a localStorage-backed outbox
([`components/outbox.ts`](components/outbox.ts)) and are flushed in order once
the network is back — so an expense added on a hill with no signal survives a
reload, and a background refetch replays anything still queued on top of the
server snapshot instead of overwriting it. A bad signal never throws a write
away; only a write the database itself rejects (six times) is set aside, and
requests give up after 20 s so one bar of signal can't stall syncing. The
header shows `Offline · N` / `Saving N` / `N waiting` whenever the queue isn't
empty.

## Stack
Next.js 15 (App Router) · React 19 · TypeScript · Supabase · lucide-react

## Setup
```bash
pnpm install
cp .env.example .env.local   # fill in your Supabase URL + publishable key
pnpm dev                     # http://localhost:5005
```

### Supabase

**Fresh database** — in the Supabase SQL Editor run, in order:
1. [`supabase-schema.sql`](supabase-schema.sql) — tables
2. [`supabase-edit-lock.sql`](supabase-edit-lock.sql) — tour details + edit lock
3. `select terra_private.set_password('your-strong-password');`

**Existing database** — if it predates multiple tours, run
[`supabase-trips.sql`](supabase-trips.sql) first (it folds old rows onto one
tour). Then steps 2 and 3 above. Every script is idempotent, so re-running is safe.

Until the edit-lock script runs, the app still shows everything, but unlocking
says `Edit lock not installed` and changes wait in the queue.

Env vars (in `.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Without them the app runs local-only (this device, always editable).
