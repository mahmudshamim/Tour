# Tour — TerraExplore

Mobile-first trip planner with shared **group expense tracking**, built with Next.js.

## Features
- Dashboard with budget ring, quick stats, recent transactions
- Map & Trip Plan (route/itinerary visuals)
- **Expenses & group balances** — add/edit/delete expenses, split between people, live balances
- Full **activity history** — every add/edit/delete recorded
- Dynamic people & settings (trip name, budget, currency)
- Light (default white) + dark theme
- **Supabase** cloud persistence with realtime sync (localStorage cache fallback)

## Stack
Next.js 15 (App Router) · React 19 · TypeScript · Supabase · lucide-react

## Setup
```bash
pnpm install
cp .env.example .env.local   # fill in your Supabase URL + publishable key
pnpm dev
```

### Supabase
Run [`supabase-schema.sql`](supabase-schema.sql) in the Supabase SQL Editor to create the tables (members, transactions, audit, app_settings) with open RLS for the anon key.

Env vars (in `.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```
