# CEOs SEO Dashboard

A live, always-on-refresh dashboard for RCEOs Digital Marketing's PT/wellness
clients. Pulls keyword rankings and AI visibility from SE Ranking, and local
pack rankings from Local Falcon, once a day via a GitHub Actions cron job,
and serves it through a Next.js dashboard hosted on Vercel.

## Stack

- **Next.js** (App Router) — the dashboard UI, hosted on Vercel
- **Supabase** — stores the daily-refreshed data (Postgres)
- **GitHub Actions** — runs the daily fetch script, no server needed

## One-time setup

### 1. Supabase

1. Open your Supabase project → **SQL Editor** → New query
2. Paste the contents of `supabase/schema.sql` and run it
3. Go to **Project Settings → API** and note down:
   - Project URL
   - `anon` `public` key
   - `service_role` key (keep this one secret — it has full DB access)

### 2. GitHub repo secrets

In your GitHub repo → **Settings → Secrets and variables → Actions**, add:

| Secret name | Value |
|---|---|
| `SE_RANKING_API_KEY` | Your SE Ranking API key |
| `LOCAL_FALCON_API_KEY` | Your Local Falcon API key |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service_role key |

Once these are set, the daily refresh (`.github/workflows/daily-refresh.yml`)
will run automatically every day at 6:00 AM Philippines time. You can also
trigger it manually any time from the **Actions** tab → "Daily data refresh" →
"Run workflow" — useful for testing before waiting for the first scheduled run.

### 3. Vercel

1. Import this GitHub repo into Vercel
2. Add these environment variables in the Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — your Supabase anon key (this one is
     safe to expose to the browser — it's read-only under the RLS policies
     in `schema.sql`)
3. Deploy. You'll get a public link like `ceos-seo.vercel.app`.

### 4. Local Falcon location mapping (needed for local pack data)

The `local_falcon_place_id` field in `data/clients.json` is currently empty
for every client. Local pack data won't show up on the dashboard until this
is filled in. For each client, find their Google Place ID in Local Falcon
(Locations tab, or via the API) and add it to `data/clients.json`, then
commit and push. The next scheduled refresh will pick it up.

### 5. Claude-powered insights (optional, but recommended)

Two features run on Claude:

- **Auto-summary blurb** — the daily refresh script writes a 2-3 sentence
  takeaway per client into the `client_insights` table, shown at the top of
  each client page.
- **"Ask about this client"** — a chat box on each client page that answers
  questions about that client's live data.

To turn these on:

1. Get an API key from https://console.anthropic.com/settings/keys
2. Add it as a **GitHub Actions secret** named `ANTHROPIC_API_KEY` (for the
   daily blurb generation)
3. Add it as a **Vercel environment variable**, also named `ANTHROPIC_API_KEY`
   (for the "Ask about this client" chat box — this one runs server-side only,
   the key is never exposed to the browser)

This is a pay-per-use API, unlike a claude.ai subscription — cost is a small
fraction of a cent per blurb or question, but it is real usage-based billing,
so keep an eye on it if you add heavier use later.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev
```

To test the refresh script locally (writes real data to Supabase):

```bash
SE_RANKING_API_KEY=... LOCAL_FALCON_API_KEY=... \
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
npm run refresh
```

## Notes

- Rank/AI colors follow the same rule as the monthly report template:
  green for top 3 / mentioned, gold for everything else.
- "Mentioned in tracked prompt" means the brand was mentioned at least once
  in the last 30 days, per the reporting rule — it never shows the specific
  date it happened.
- The `refresh_log` table in Supabase keeps a row per daily run so you can
  check whether it succeeded, partially failed, or failed outright.
