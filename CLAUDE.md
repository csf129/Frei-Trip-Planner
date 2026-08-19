# Fern & Ferry — project brief for Claude Code

## What this is
A family trip-planning web app, shared with friends and family via a public
link. It's a single React component (`src/App.jsx`) backed by Supabase. The
first trip (Nova Scotia + Newfoundland, Jun 26 – Jul 10 2027) is seeded with
a full day-by-day itinerary, a pre-trip checklist with due dates, a month
calendar, and a budget (savings goal + expense log). It's meant to be
reused for future trips, not just this one.

## Stack
- React 18 + Vite
- Tailwind CSS v3 (utility classes) + inline styles for the earthy palette
- lucide-react (icons), recharts (budget pie)
- Supabase (Postgres + Auth + Realtime) via `src/lib/supabaseClient.js`

## Run / build
- `npm install`
- `npm run dev` — local dev server
- `npm run build` — production build to `dist/`
- `npm run preview` — serve the build

## Environment variables
Copy `.env.local.example` → `.env.local`.

| Variable | Role |
|----------|------|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Required — Supabase project URL + anon/public key (safe for the browser; RLS protects the data) |

## Data & access model
- **One shared row**: `public.app_state` holds the entire app state
  (`{ settings, trips, activeTripId }`) as a single `jsonb` blob — the same
  shape the app has always used in memory. See
  `supabase/migrations/20260818000000_initial_schema.sql` for schema, RLS,
  and the seed data.
- **Public read, authenticated write**: anyone with the link can view the
  plan with no login. Only signed-in users can save changes (RLS policy
  `app_state_authenticated_write`). Editors are added manually via
  **Supabase → Authentication → Users → Invite user** — public self-serve
  sign-up should stay off.
- **Auth**: email magic-link (`supabase.auth.signInWithOtp`). No
  `/auth/callback` route needed — this is a plain Vite SPA, and
  supabase-js's default `detectSessionInUrl` picks up the session from the
  redirect automatically.
- **Realtime sync**: the app subscribes to Postgres changes on `app_state`
  (`src/App.jsx`, in the main `useEffect`) so edits from one signed-in
  editor appear live in every other open browser, including anonymous
  viewers.
- **`canEdit`** (`= !!session`) is threaded through the `shared` props
  object and gates every mutating control (add/edit/delete buttons, inline
  inputs). Read-only viewers can still navigate freely between trips and
  tabs — that's local-only state and never gets persisted, since the save
  effect itself also short-circuits when `!canEdit`.

## Design intent (keep this feel)
Earthy, calm, family-friendly. Three themes (Fernwood/Clay Coast/Lakeside)
in Settings. Palette lives in the `THEMES` object; per-element colors use
inline `style` with hex so we're not fighting Tailwind's default palette.
Serif (Georgia) for headings, system sans for body. Don't make it loud.

## Data model (in App.jsx)
- `settings` — appName, theme, currency, reminderLeadDays, notifications, family[]
- `trips[]` — each has: days[], todos[], budget{ savingsGoal, saved, categories[], expenses[] }
- `activeTripId`
- `seedState()` builds the initial state; `seedTrip()` is the NS/NL trip.
  (Also mirrored as static JSON in the migration's seed `insert`.)

## Roadmap (priority order — what the family actually wants)

### 1. ~~Shared data across devices~~ — done
Supabase-backed, public read / authenticated write, realtime sync. See
"Data & access model" above.

### 2. Real text (SMS) reminders
This CANNOT run in the browser — it needs a server that runs on a schedule.
- Provider: **Twilio** (or similar). Store phone numbers in settings.
- A scheduled job (e.g. Supabase Edge Function on a cron, or a Vercel Cron
  route) runs daily, finds todos whose `due` minus `reminderLeadDays` is
  today, and texts the family. Mark sent so we don't double-text.
- Keep the existing in-app "Coming up" panel and browser notifications as-is.

### 3. ~~Deploy / hosting~~ — done
Deployed via GitHub → Vercel (or Netlify/Cloudflare Pages), env vars set in
the host's project settings.

### 4. Nice-to-haves
- Split App.jsx into components now that shared data has landed (Dashboard,
  Itinerary, Calendar, Todos, Budget, Settings + shared UI). Single file was
  deliberate for the handoff; refactor when it stops helping.
- Packing-list tab (per-trip, checkable).
- Attach lodging/ferry confirmation numbers to checklist items.
- Export a trip to PDF.
- Optional: per-viewer theme preference instead of a shared setting (theme
  currently lives in the shared `settings` blob, so one editor's choice
  currently applies to everyone).

## House rules
- Don't commit secrets. Use `.env.local` (already gitignored).
- Keep the async `store.get()/store.set()` interface stable so the UI
  doesn't churn (`src/App.jsx`).
- Preserve the three themes and the calm, earthy aesthetic.
- Schema changes go in a new dated file under `supabase/migrations/` — don't
  edit an already-applied migration.
