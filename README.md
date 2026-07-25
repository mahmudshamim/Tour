# Tour — TerraExplore

Mobile-first trip planner with shared **group expense tracking**, built with Next.js.

## Features
- Dashboard with budget ring, quick stats, recent transactions
- Map & Trip Plan (route/itinerary visuals)
- **Multiple trips** — each tour keeps its own people, expenses, history and places; archive a finished one to freeze it read-only
- **Expenses & group balances** — split from the pool, charge one person, or log **own-pocket** spend that never touches the group's money
- Full **activity history** — every add/edit/delete recorded
- **Works offline** — every write is queued in a durable outbox and flushed when the network returns; installable as a PWA
- Light (default white) + dark theme
- **Supabase** cloud persistence with realtime sync (localStorage cache fallback)

## Offline
Writes never go straight to Supabase. They land in a localStorage-backed outbox
([`components/outbox.ts`](components/outbox.ts)) and are flushed in order once
the network is back — so an expense added on a hill with no signal survives a
reload, and a background refetch replays anything still queued on top of the
server snapshot instead of overwriting it. The header shows `Offline · N` /
`Saving N` whenever the queue isn't empty.

A service worker ([`public/sw.js`](public/sw.js)) caches the app shell, so the
app opens with no network at all. It's registered in production builds only.

## Stack
Next.js 15 (App Router) · React 19 · TypeScript · Supabase · lucide-react

## Setup
```bash
pnpm install
cp .env.example .env.local   # fill in your Supabase URL + publishable key
pnpm dev
```

### Supabase

**Fresh database** — run [`supabase-schema.sql`](supabase-schema.sql) in the Supabase SQL Editor. It creates `trips`, `members`, `transactions`, `audit`, `places` (plus the legacy `app_settings`) with open RLS for the anon key.

**Existing database from before multi-trip** — run [`supabase-trips.sql`](supabase-trips.sql) instead. It adds the `trips` table and a `trip_id` column to every table, then folds all existing rows onto one trip seeded from your old `app_settings`. It's idempotent, so re-running it is safe.

Until the migration runs, the app shows `Cloud error: … trips …` in Settings → Data and keeps working from its local cache.

Env vars (in `.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```
