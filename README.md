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
- Ticket numbers come from a Postgres sequence — two people saving at the same
  second can never get the same number.
- Live sync: a ticket booked at the counter appears on the workshop screen in
  about a second, no refresh.
- Staff login. Nothing is readable without an account.

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
