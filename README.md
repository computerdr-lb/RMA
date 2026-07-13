# Computer Doctor

Device intake and repair tracking for a computer repair shop.
Phone-number lookup at the counter, one ticket per device, printing to an
80 mm receipt printer and a 40 × 21 mm label printer.

**Stack:** React + Vite · Supabase (Postgres + Auth) · Netlify

Any browser, anywhere — the shop PC, the workshop, your phone. Every screen
shows the same data, live.

## Features

- Phone-first intake: known number opens the client, unknown number opens a
  pre-filled new client card and goes straight to a ticket.
- Client directory, filterable by name or phone.
- Ticket: device type (editable list), with charger / with bag, repair notes,
  repair cost, status (Received → In progress → Ready → Delivered).
- Receipt and label previews at true physical size, with a Code 39 barcode.
- **Works with no internet.** Look up a client, open a ticket, print a
  receipt — all of it works offline. Changes sync automatically once the
  connection is back, and a small bar at the top says so while it happens.
- Ticket numbers are generated on the device, not the server, so they're
  never blocked by a dropped connection — see "How offline works" below.
- Live sync: a ticket booked at the counter appears on the workshop screen in
  about a second, no refresh, whenever both are online.
- Staff login. Nothing is readable without an account.

---

## How offline works

Every screen reads from a local database in the browser (IndexedDB), so it
opens and responds instantly whether or not there's internet. Every save
writes there first, then queues to sync with Supabase. A small bar appears
at the top only when it's relevant — working offline, or catching up — and
disappears once everything's synced.

**Ticket numbers** are the one thing that has to work differently offline.
Instead of Postgres handing out `CD-00001`, `CD-00002`… in order, each
device picks its own short tag the first time it's used (e.g. `CD-K3F9-0001`,
`CD-7QAL-0001`). Two shop PCs, both offline at the same moment, can never
produce the same number — there's no coordination needed between them.
That number is permanent; it doesn't get renumbered once you're back online.

**If you already ran the old schema.sql** (the one where Postgres assigned
numbers), run [`supabase/offline-migration.sql`](supabase/offline-migration.sql)
once — existing tickets are untouched.

**Known limitation.** If PC 2 deletes a ticket while PC 1 is offline, PC 1's
local copy won't disappear until you say so — the app doesn't yet track
deletions across an offline gap. Fine for a two-PC shop; ask if this needs
tightening up.

**First login still needs internet, once.** After that, Supabase keeps you
signed in locally, so subsequent offline sessions don't need to re-authenticate.

---

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is plenty).
2. **SQL Editor → New query** → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Authentication → Providers → Email**: turn **"Enable email signups" OFF**.
   You do not want the internet creating accounts on your shop system.
4. **Authentication → Users → Add user** — one per staff member. Set a password;
   tick "Auto Confirm User".
5. **Project Settings → API** — copy the **Project URL** and the **anon public** key.

### 2. Netlify

1. Push this repo to GitHub.
2. Netlify → **Add new site → Import an existing project** → pick the repo.
   Build command and publish directory come from `netlify.toml` — leave them.
3. **Site settings → Environment variables** → add:

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon public key |

4. **Deploys → Trigger deploy**. (Env vars only apply to builds that run after
   you add them — the first deploy will show a blank screen otherwise.)

### 3. Local development

```bash
npm install
cp .env.example .env      # then paste your two Supabase values in
npm run dev               # http://localhost:5173
```

---

## Is the anon key a secret?

No — it ships inside every browser that loads the app, by design. What protects
your customer data is **Row Level Security**: the policies in `schema.sql` allow
reads and writes only to a signed-in staff account. Without a login, the key
opens nothing.

Two rules follow from that:
- Never put the **service_role** key in this app. It bypasses RLS entirely.
- Keep email signups disabled, so only you can create accounts.

## Printing

See [`docs/PRINTING.md`](docs/PRINTING.md). Short version: Chrome, margins
**None**, scale **100%**.

## Backups

Supabase's free tier keeps daily backups for 7 days. If this database becomes
the shop's memory, turn on Point-in-Time Recovery (paid) or schedule a weekly
`pg_dump`. Losing your client list is the one failure you cannot repair.
