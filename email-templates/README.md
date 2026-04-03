# Salarn Email Templates

Modern Web3-style HTML email templates for Supabase Auth.

## Templates

| File | Purpose | Supabase Setting |
|------|---------|-----------------|
| `confirm-signup.html` | Email verification on signup | Auth > Email Templates > Confirm signup |
| `magic-link.html` | Passwordless magic link | Auth > Email Templates > Magic Link |
| `reset-password.html` | Password reset email | Auth > Email Templates > Reset Password |
| `change-email.html` | Email change confirmation | Auth > Email Templates > Change Email Address |
| `withdrawal-otp.html` | Admin-sent OTP for withdrawals | Manual — sent by admin via support |

## How to Use in Supabase

1. Go to your Supabase project dashboard
2. Navigate to **Authentication > Email Templates**
3. For each template:
   - Select the template type
   - Copy the HTML content from the corresponding file
   - Paste into the "Message body" field
   - Save the template

## Template Variables (Supabase auto-replaces these)

- `{{ .ConfirmationURL }}` — The full confirmation/action URL

## Notes

- All templates use `#0d1117` dark background (matches Salarn's dark theme)
- Mobile responsive via simple CSS
- The withdrawal OTP template (`withdrawal-otp.html`) uses `{{OTP_CODE}}` as a placeholder — replace manually when sending, or build a server-side email function
- Test emails in the Supabase dashboard before going live
