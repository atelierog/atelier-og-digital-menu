# Digital Vision authentication email setup

## Current status

- Sending domain: `atelierog.co.in` — verified in Resend.
- Intended sender: `no-reply@atelierog.co.in`.
- Recovery UI: the app now has an OTP entry flow.
- Important: the OTP flow will not work until Supabase Auth SMTP and the Recovery email template are configured as below. Do not consider email recovery production-ready before a real delivery and end-to-end test.

## 1. Configure a domain-scoped Resend SMTP/API credential

In Resend, create a new API key with **Sending access** scoped only to `atelierog.co.in`. Keep the key private; do not put it in source code or chat.

## 2. Configure Supabase SMTP

Open the Supabase project `Atelier-Og-Digital-Menu` (`qwyquvufneolyesfiipf`) and navigate to **Authentication → SMTP Settings** (menu wording may vary).

Use:
- Sender name: `Digital Vision by Atelier OG`
- Sender email: `no-reply@atelierog.co.in`
- SMTP host: `smtp.resend.com`
- SMTP port: `465` (SSL) or `587` (STARTTLS)
- SMTP username: `resend`
- SMTP password: the domain-scoped Resend API key created in step 1

Save the settings. Do not expose the key in frontend code, GitHub, or a public environment variable.

## 3. Configure the Recovery email template

In **Authentication → Email Templates → Reset Password / Recovery**:
- Subject: `Your Digital Vision password reset code`
- Use the HTML from `supabase/email-templates/password-recovery.html`.
- The template must include Supabase's `{{ .Token }}` variable. Do not replace it with a hard-coded code or a reset URL if the UI is using OTP verification.

The HTML is designed with the graphite/platinum Digital Vision brand.

## 4. Verify the complete flow

1. Open `https://digitalvision.atelierog.co.in/`.
2. Select **Forgot password?** and enter the Super Admin email.
3. Confirm the message arrives from `Digital Vision by Atelier OG <no-reply@atelierog.co.in>`.
4. Enter the one-time code and set a new password.
5. Sign in with the new password and confirm the account still has `app_metadata.role = admin`.
6. Test an expired/incorrect code and confirm it is rejected.

## Security rules

- Never email a permanent password.
- Keep OTPs short-lived and enforce Supabase's rate limits.
- Do not let browser code set `app_metadata.role`.
- Keep Super Admin recovery separate from staff account resets.
- Enable Supabase leaked-password protection before production use.
