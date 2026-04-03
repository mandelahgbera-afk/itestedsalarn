# Salarn — Vercel Deployment Guide

## Prerequisites

- A Supabase project (free tier works)
- A Vercel account (free tier works)
- Your Supabase URL and anon key

---

## Step 1: Set Up Supabase

### 1a. Create a Supabase project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Fill in name, password, region → Create

### 1b. Run the database schema
1. Click **SQL Editor** in the left sidebar → **New query**
2. Open `SUPABASE-SCHEMA.sql` from this folder
3. Copy the full contents, paste, click **Run**
4. You should see: `Success. No rows returned`

### 1c. Set up email templates
1. Go to **Authentication → Email Templates**
2. For each template, paste the HTML from `email-templates/`:
   - **Confirm signup** → `confirm-signup.html`
   - **Magic Link** → `magic-link.html`
   - **Reset Password** → `reset-password.html`
   - **Change Email** → `change-email.html`

### 1d. Configure Auth settings
1. Go to **Authentication → URL Configuration**
2. **Site URL**: `https://salarnweb3.vercel.app` (your actual Vercel domain)
3. **Redirect URLs** → Add: `https://salarnweb3.vercel.app/auth/callback`
4. Click **Save**

> ⚠️ **The redirect URL must match exactly.** If your domain is `salarnweb3.vercel.app`, the callback must be `https://salarnweb3.vercel.app/auth/callback`. No trailing slash.

### 1e. Get your API keys
1. Go to **Project Settings** (gear icon) → **API**
2. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon/public key** → `VITE_SUPABASE_ANON_KEY`

---

## Step 2: Push to GitHub

Push the `salarn/` folder as a standalone repo:

```bash
cd artifacts/salarn
git init
git add .
git commit -m "salarn initial deploy"
git remote add origin https://github.com/YOUR_USERNAME/salarn.git
git push -u origin main
```

---

## Step 3: Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your `salarn` repo
3. **Framework Preset**: leave as "Other" (do NOT pick Vite — we have a custom build)
4. **Environment Variables** — add these two:

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://xxxxxxxxxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGci...your anon key...` |

5. Click **Deploy** → wait ~90 seconds

---

## Step 4: Set Yourself as Admin

After first sign-up (and confirming your email):

```sql
UPDATE public.users SET role = 'admin' WHERE email = 'your@email.com';
```

Run this in Supabase → SQL Editor. Then sign out and back in.

---

## Step 5: Set Deposit Addresses

1. Sign in as admin → **Admin → Platform Settings**
2. Enter your BTC, ETH, USDT, BNB wallet addresses
3. Set minimum deposit/withdrawal amounts

---

## Troubleshooting

### "Sign in is taking too long"
- Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Vercel
- Go to Vercel → Your project → Settings → Environment Variables
- After adding/changing env vars you **must redeploy** (Deployments → Redeploy)

### Blank page or "not found" after deploy
- Confirm `outputDirectory` in vercel.json is `dist/public` ✓
- Check Vercel build logs for TypeScript or Vite errors
- Make sure Node.js version is 20.x (Vercel → Project Settings → General → Node.js Version)

### Sign in works but immediately redirected away / stuck on callback
- Your Supabase **Redirect URLs** must include `https://YOUR-DOMAIN.vercel.app/auth/callback`
- Your **Site URL** must exactly match `https://YOUR-DOMAIN.vercel.app` (no trailing slash)

### Signup returns `{}` or profile not created
- Run `SUPABASE-PATCH.sql` in SQL Editor — it creates the `handle_new_user` trigger
- Verify: `SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created';` → should return 1 row

### "Email not confirmed" when signing in
- Check spam folder
- For testing: Supabase → Auth → Settings → **disable** email confirmation temporarily

### Build fails on Vercel
- Ensure Node.js 20.x is set in Vercel project settings
- The `scripts/prepare-standalone.cjs` script replaces workspace catalog references — if it fails, check the error message for which package version is missing
