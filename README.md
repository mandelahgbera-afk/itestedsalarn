# Salarn — Crypto Copy-Trading Platform

A dark Web3 investment platform where users deposit funds, follow professional traders, and watch their portfolio grow — all managed through a clean admin dashboard.

**Stack:** React + Vite · TypeScript · Supabase (auth + database + realtime) · Tailwind CSS · Vercel

---

## What you get

| Feature | Details |
|---|---|
| Auth | Sign up, sign in, forgot password, PKCE-secured email links |
| Dashboard | Live portfolio value, P&L chart, recent transactions |
| Copy Trading | Follow/unfollow traders, set allocation |
| Trade | Buy and sell crypto from your balance |
| Portfolio | Holdings with live profit/loss |
| Transactions | Full deposit/withdrawal history |
| Admin panel | Approve transactions, manage users, traders, cryptos, platform settings |

---

## Before you start — what you need

- A free [Supabase](https://supabase.com) account
- A free [Vercel](https://vercel.com) account
- A free [GitHub](https://github.com) account
- Node.js 20+ installed locally (only needed if you want to run it on your machine)

---

## Step 1 — Set up Supabase

### 1a. Create a project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New project**
3. Fill in a name (e.g. `salarn`), set a strong database password, pick the region closest to your users
4. Click **Create new project** — wait about 2 minutes for it to spin up

### 1b. Run the database schema

This creates all the tables, policies, and triggers the app needs.

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open `SUPABASE-SCHEMA.sql` from this folder, copy the entire contents, paste it in, click **Run**
4. You should see: `Success. No rows returned`

> **Already ran the schema before?** Use `SUPABASE-PATCH.sql` instead — it only adds the trigger and backfills any existing users safely.

**Why does the trigger matter?**
When someone signs up, a database trigger automatically creates their profile row and starting balance. Without it, sign-in fails silently because the profile doesn't exist yet and the client-side insert gets blocked by row-level security.

Verify it worked:
```sql
SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```
→ Should return 1 row.

### 1c. Enable Realtime (recommended)

This makes balances and transactions update live without refreshing.

Run in SQL Editor:
```sql
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.user_balances;
alter publication supabase_realtime add table public.portfolio;
```

Or go to **Database → Replication** and toggle those three tables on.

### 1d. Set up email templates

This gives your emails the same dark Web3 look as the app.

1. Go to **Authentication → Email Templates**
2. For each template below, open the file from `email-templates/`, copy the HTML, paste it into the "Message body" field, and save:

| Template type in Supabase | File to use |
|---|---|
| Confirm signup | `email-templates/confirm-signup.html` |
| Magic Link | `email-templates/magic-link.html` |
| Reset Password | `email-templates/reset-password.html` |
| Change Email Address | `email-templates/change-email.html` |

### 1e. Configure auth redirect URLs

This tells Supabase where to send users after they click an email link.

1. Go to **Authentication → URL Configuration**
2. **Site URL**: `https://YOUR-DOMAIN.vercel.app` (you'll fill in the real domain after deploying to Vercel)
3. **Redirect URLs** → Add: `https://YOUR-DOMAIN.vercel.app/auth/callback`
4. Click **Save**

> The URL must match exactly — no trailing slash, must be `https://`.

### 1f. Copy your API keys

1. Go to **Project Settings** (gear icon, bottom-left) → **API**
2. Copy these two values — you'll need them in Step 3:

```
Project URL       →  this becomes VITE_SUPABASE_URL
anon / public key →  this becomes VITE_SUPABASE_ANON_KEY
```

---

## Step 2 — Push to GitHub

You need to put the code on GitHub so Vercel can pull from it.

If you're in the `artifacts/salarn` folder:

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/salarn.git
git push -u origin main
```

> Create the `salarn` repo on GitHub first (go to github.com → New repository), then come back and run these commands.

---

## Step 3 — Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import** next to your `salarn` repo
3. On the configure screen:
   - **Framework Preset**: leave it as **Other** (do NOT choose Vite — the project has a custom build script)
   - Under **Environment Variables**, add both of these:

| Variable name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Project URL from Step 1f |
| `VITE_SUPABASE_ANON_KEY` | Your anon key from Step 1f |

4. Click **Deploy** — takes about 60–90 seconds
5. When it finishes, copy your `.vercel.app` URL (e.g. `https://salarn-xyz.vercel.app`)

**Now go back to Supabase** (Authentication → URL Configuration) and replace `YOUR-DOMAIN` with your actual Vercel domain in the Site URL and Redirect URL fields. Save.

---

## Step 4 — First login and admin setup

### 4a. Sign up

1. Open your Vercel URL in a browser
2. Click **Get Started** → sign up with your email
3. Check your email and confirm it (check spam if you don't see it)
4. Sign in — you'll land on the dashboard

### 4b. Make yourself admin

1. Go back to Supabase → **SQL Editor** → New query
2. Run this (swap in your email):

```sql
UPDATE public.users
SET role = 'admin'
WHERE email = 'you@example.com';
```

3. Sign out of Salarn and sign back in
4. You'll now see an **Admin** link in the sidebar

---

## Step 5 — Configure the platform

### Add deposit wallet addresses

1. Sign in as admin → go to **Admin → Platform Settings**
2. Enter your wallet addresses for BTC, ETH, USDT, and BNB
3. Set minimum deposit/withdrawal amounts and fee percentages
4. Save — users will see these addresses when they request a deposit

### Add copy traders

You can add traders through the admin panel (**Admin → Manage Traders**), or insert them directly in SQL to get started faster:

```sql
INSERT INTO public.copy_traders
  (trader_name, specialty, total_profit_pct, monthly_profit_pct,
   win_rate, total_trades, followers, profit_split_pct,
   min_allocation, risk_level, avatar_color, is_approved, is_active)
VALUES
  ('AlphaWave', 'BTC/ETH Swing Trading',
   284.5, 18.2, 74.3, 1842, 3210, 15, 100, 'medium', '#6366f1', true, true),
  ('NightOwl', 'Altcoin Scalping',
   198.3, 12.7, 68.1, 3421, 1870, 20, 50,  'high',   '#ef4444', true, true),
  ('SafeHands', 'Conservative BTC',
   94.1,   6.4, 81.9,  987, 5420, 10, 200, 'low',    '#10b981', true, true);
```

---

## Using the platform

### As a user

| What you want to do | Where to go |
|---|---|
| See your balance and total P&L | Dashboard |
| Deposit crypto | Transactions → Request Deposit → copy the wallet address shown, send funds, submit confirmation |
| Buy / sell crypto | Trade |
| Follow a copy trader | Copy Trading → choose a trader → Follow |
| See your holdings | Portfolio |
| Request a withdrawal | Transactions → Request Withdrawal |
| Change email, password, or notifications | Settings |

### As an admin

| What you want to do | Where to go |
|---|---|
| Approve or reject a deposit/withdrawal | Admin → Transactions |
| Add or remove copy traders | Admin → Manage Traders |
| Add or remove crypto pairs | Admin → Manage Cryptos |
| View and manage user accounts | Admin → Manage Users |
| Set wallet addresses and fees | Admin → Platform Settings |
| See platform-wide stats | Admin Dashboard |

---

## Running locally (optional)

```bash
# Install dependencies
npm install

# Create a .env file
echo "VITE_SUPABASE_URL=https://your-project.supabase.co" > .env
echo "VITE_SUPABASE_ANON_KEY=your-anon-key" >> .env

# Start the dev server
npm run dev
```

Open `http://localhost:5173`. Auth email links will still point to your Vercel domain (configured in Supabase), so for local password reset testing add `http://localhost:5173/auth/callback` to your Supabase redirect URLs too.

---

## Troubleshooting

### "Sign in is taking too long" or spinner never stops
- Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Vercel → Project Settings → Environment Variables
- After adding or changing env vars you **must redeploy** (Vercel → Deployments → the three-dot menu → Redeploy)

### Blank page after deploying
- Make sure Node.js version is set to **20.x** in Vercel → Project Settings → General → Node.js Version → Save → Redeploy
- Check the Vercel build logs for errors

### Clicking the email link doesn't sign me in / loops back to sign-in
- Your Supabase **Redirect URLs** must include `https://YOUR-DOMAIN.vercel.app/auth/callback` exactly
- Your **Site URL** must be `https://YOUR-DOMAIN.vercel.app` with no trailing slash
- Both must be saved in **Authentication → URL Configuration**

### Signed up but can't sign in — profile not found
- The `handle_new_user` trigger may not be running. Run `SUPABASE-PATCH.sql` in the SQL Editor
- Verify: `SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created';` → must return 1 row

### "Email not confirmed" error
- Check your spam folder
- For development/testing: Supabase → Authentication → Settings → disable **Enable email confirmations** temporarily

### Deposit approved but balance didn't change
- Run `SUPABASE-PATCH.sql` — it adds the upsert-safe balance handling for users who were created before the trigger was in place

### Build fails on Vercel with workspace catalog errors
- Make sure Framework Preset is set to **Other** (not Vite)
- The custom `scripts/prepare-standalone.cjs` script rewrites workspace package references for standalone deployment — it runs automatically as part of the build command in `package.json`

---

## Project structure (for developers)

```
salarn/
├── src/
│   ├── pages/
│   │   ├── Landing.tsx          # Public landing page
│   │   ├── Auth.tsx             # Sign in / sign up / forgot password
│   │   ├── AuthCallback.tsx     # Handles Supabase email link redirects
│   │   ├── ResetPassword.tsx    # Set new password after reset link
│   │   ├── Dashboard.tsx
│   │   ├── Trade.tsx
│   │   ├── Portfolio.tsx
│   │   ├── CopyTrading.tsx
│   │   ├── Transactions.tsx
│   │   ├── Settings.tsx
│   │   └── admin/
│   │       ├── AdminDashboard.tsx
│   │       ├── AdminTransactions.tsx
│   │       ├── ManageUsers.tsx
│   │       ├── ManageTraders.tsx
│   │       ├── ManageCryptos.tsx
│   │       └── PlatformSettings.tsx
│   ├── lib/
│   │   ├── supabase.ts          # Supabase client (PKCE flow)
│   │   ├── auth.tsx             # Auth context, forgot password, reset
│   │   └── api.ts               # All database queries
│   └── components/
│       ├── AppLayout.tsx
│       ├── ProtectedRoute.tsx
│       └── AdminRoute.tsx
├── email-templates/             # HTML email templates for Supabase Auth
├── SUPABASE-SCHEMA.sql          # Full database schema — run this first
├── SUPABASE-PATCH.sql           # Incremental patch for existing installs
└── scripts/
    └── prepare-standalone.cjs   # Rewrites workspace deps for Vercel build
```

---

## License

MIT — use it, fork it, build on it.
