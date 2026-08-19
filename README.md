# Fern & Ferry — Family Trip Planner

A trip planner for our family road trips, shared with anyone we send the
link to. The first trip (Nova Scotia + Newfoundland 2027) is pre-loaded:
itinerary, pre-trip checklist, calendar, and budget. Built to reuse for
every future trip.

Anyone with the link can **view** the plan — no account needed. Only people
who've been invited to sign in can **edit** it, and their changes sync live
to everyone else looking at the page.

## Prerequisites

- Node.js 18+ installed (https://nodejs.org)
- A free Supabase project (https://app.supabase.com)

## 1. Install and run locally

```bash
npm install
```

Copy `.env.local.example` to `.env.local` (e.g. `copy .env.local.example
.env.local` on Windows, or `cp` on macOS/Linux), then fill in your Supabase
**Project URL** and **anon/public key** (Project Settings → API in the
Supabase dashboard).

```bash
npm run dev
```

Open the URL it prints (usually http://localhost:5173).

## 2. Create the database

In the Supabase dashboard, open **SQL Editor** → **New query**, paste the
contents of `supabase/migrations/20260818000000_initial_schema.sql`, and run
it once. This creates:

- `public.app_state` — one row holding the whole shared plan as JSON
- Row Level Security: public read, authenticated-only write
- Realtime enabled on the table, so edits push live to every open browser
- The seed row with the Nova Scotia + Newfoundland trip already in it

Turn on **Email** auth (**Authentication → Providers → Email**), and turn
**off** public self-serve sign-up so only people you invite can edit.
Invite editors (yourself, your spouse, anyone else) under
**Authentication → Users → Invite user**. For local development, set
**Authentication → URL Configuration → Site URL** to
`http://localhost:5173`.

## 3. Build for the web

```bash
npm run build      # outputs to /dist
npm run preview    # preview the production build
```

## 4. Deploy

Push this repo to GitHub, then import it in Vercel (or Netlify/Cloudflare
Pages). Set the same two environment variables (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`) in the host's project settings, and update
Supabase's **Site URL** / **Redirect URLs** to the deployed domain so the
sign-in email link comes back to the right place. Share the deployed URL
with friends and family.

## Continuing in Claude Code

Open this folder in your terminal and run `claude`. See `CLAUDE.md` for the
project brief and remaining roadmap (real SMS reminders, splitting
`App.jsx` into components, etc.).

## Project layout

- `src/App.jsx` — the whole app (single file, on purpose — easy to hand off)
- `src/lib/supabaseClient.js` — Supabase client (reads `VITE_SUPABASE_*` env vars)
- `src/main.jsx` — React entry point
- `src/index.css` — Tailwind directives
- `supabase/migrations/` — schema, RLS, and seed data to apply in Supabase
- `CLAUDE.md` — project brief + roadmap for Claude Code
