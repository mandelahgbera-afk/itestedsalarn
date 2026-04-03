# Salarn — Supabase Setup Guide

---

## Step 1 — Create a Supabase Project

1. Go to **[supabase.com](https://supabase.com)** → sign in
2. Click **New Project**
3. Fill in:
   - **Name:** salarn (or anything)
   - **Database Password:** something strong — save it
   - **Region:** pick the one closest to your users
4. Click **Create new project** — wait ~2 min

---

## Step 2 — Run the Database Schema

**Fresh install (no tables yet):**

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open **`SUPABASE-SCHEMA.sql`** from this folder
4. Copy the entire file contents, paste into the SQL Editor, click **Run**
5. You should see: `Success. No rows returned`

**Already ran the schema before?** Run `SUPABASE-PATCH.sql` instead — it's a smaller file that adds only the trigger and backfills any existing users who are missing profile rows.

> **Why the trigger matters:** The `handle_new_user` trigger on `auth.users` creates the `public.users` profile row and `user_balances` row server-side (as `security definer`, bypassing RLS) immediately after every signup. Without this trigger, sign-in fails silently because the profile row doesn't exist and the client-side insert can be blocked by RLS timing.

---

## Step 3 — Set Up Email Templates

1. Go to **Authentication → Email Templates**
2. For each template, copy the HTML from the `email-templates/` folder:
   - **Confirm signup** → `email-templates/confirm-signup.html`
   - **Magic Link** → `email-templates/magic-link.html`
   - **Reset Password** → `email-templates/reset-password.html`
   - **Change Email Address** → `email-templates/change-email.html`
3. Paste into the "Message body" field and save

---

## Step 4 — Get Your API Keys

1. Go to **Project Settings** (gear icon, bottom left) → **API**
2. Copy these two values — you'll need them for Vercel:

```
Project URL     →  VITE_SUPABASE_URL
anon/public key →  VITE_SUPABASE_ANON_KEY
```

---

## Step 5 — Enable Realtime (optional but recommended)

1. Go to **Database → Replication** in the left sidebar
2. Under **Supabase Realtime**, enable these tables:
   - `user_balances`
   - `transactions`
   - `portfolio`

Or run in SQL Editor:
```sql
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.user_balances;
alter publication supabase_realtime add table public.portfolio;
```

---

## Step 6 — Configure Auth Settings

1. Go to **Authentication → URL Configuration**
2. Set **Site URL**: `https://your-vercel-domain.vercel.app`
3. Add **Redirect URLs**: `https://your-vercel-domain.vercel.app/auth/callback`
4. Click **Save**

---

## Step 7 — Make Yourself Admin

1. Sign up normally on the platform at `/auth`
2. Confirm your email (check spam)
3. Sign in — you'll land on the dashboard
4. Go back to Supabase → **SQL Editor** → New query
5. Run this (replace with your email):

```sql
UPDATE public.users
SET role = 'admin'
WHERE email = 'you@example.com';
```

6. Sign out and sign back in — you'll now see the Admin panel link

---

## Step 8 — Add Copy Traders

The schema seeds crypto data automatically. Add traders manually:

```sql
INSERT INTO public.copy_traders
  (trader_name, specialty, total_profit_pct, monthly_profit_pct,
   win_rate, total_trades, followers, profit_split_pct,
   min_allocation, risk_level, avatar_color, is_approved, is_active)
VALUES
  ('AlphaWave', 'BTC/ETH Swing Trading',
   284.5, 18.2, 74.3, 1842, 3210, 15, 100, 'medium', '#6366f1', true, true),
  ('NightOwl',  'Altcoin Scalping',
   198.3, 12.7, 68.1, 3421, 1870, 20, 50,  'high',   '#ef4444', true, true),
  ('SafeHands', 'Conservative BTC',
   94.1,   6.4, 81.9,  987,  5420, 10, 200, 'low',    '#10b981', true, true);
```

---

## Step 9 — Configure Deposit Addresses

1. Sign in as admin → go to **Admin → Platform Settings**
2. Enter your wallet addresses for BTC, ETH, USDT, BNB
3. Set your minimum deposit/withdrawal amounts and fees
4. Click **Save**

Users will see these addresses when they request a deposit.

---

## Verification Checklist

- [ ] Schema ran without errors
- [ ] `SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';` returns 1 row
- [ ] Email templates are set in Auth → Email Templates
- [ ] Auth redirect URLs are configured
- [ ] At least one user is set as admin
- [ ] Deposit addresses are configured in Admin → Platform Settings
