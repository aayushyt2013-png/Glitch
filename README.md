# Glitch on Vercel

```text
Browser ──> Vercel: public/index.html + api/* ──> Gemini 2.5 Flash-Lite / OpenRouter Nemotron
   │                                              └── Google Search grounding
   └──────> Supabase: email sign-in, anonymous guests, guest message counters
```

Everything runs on Vercel and Supabase, so it works while your computer is off.

## 1. Supabase

1. Create a project at Supabase.
2. **SQL Editor → New query**: paste `supabase.sql` and run it. This creates the private guest-usage table and RPC functions for the 30-message guest limit. It also removes the old browser Storage policies used for file features. Chat history is stored locally in the signed-in user’s browser and does not require a new table. Re-run it after updating to this version.
3. **Authentication → Sign In / Providers → Email**: decide whether to require email confirmation.
4. **Authentication → Sign In / Providers → Anonymous Sign-Ins**: enable this to allow guest mode.
5. **Project Settings → API Keys**: copy the Project URL and public `anon`/publishable key. Never put a service-role key in the browser or this repository.

The SQL migration does not delete old Storage objects. They remain private after the old policies are removed; delete them from Supabase Storage manually if you no longer need them.

## 2. Configure and deploy

Add these environment variables in Vercel → Project → Settings → Environment Variables:

```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
GOOGLE_API_KEY=
OPENROUTER_API_KEY=
ALLOWED_EMAILS=
```

- `GOOGLE_API_KEY` powers Flash and web search.
- `OPENROUTER_API_KEY` powers Cognition.
- The model IDs are hardcoded in `api/_llm.js`: `gemini-2.5-flash-lite` and `nvidia/nemotron-3-ultra-550b-a55b:free`.
- `ALLOWED_EMAILS` is optional. Empty means any registered account can chat.

Push the folder to GitHub, import it into Vercel, add the variables, then deploy. Or use the Vercel CLI:

```bash
npm install
vercel
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add GOOGLE_API_KEY
vercel env add OPENROUTER_API_KEY
vercel --prod
```

Redeploy after changing environment variables. Open the site and choose **Create account** or **Continue as guest**.

## What it does

| Feature | Behavior |
|---|---|
| Sign in / guest | Supabase email + password or anonymous guest sessions |
| Guest limit | 30 messages per anonymous Supabase account, enforced atomically on the server using Supabase RPC |
| Flash | Google Gemini 2.5 Flash-Lite (Google AI free tier, subject to availability and quotas) |
| Cognition | NVIDIA Nemotron 3 Ultra free endpoint through OpenRouter |
| Web search | Both modes can call `web_search`, powered by Gemini Google Search grounding; time-sensitive requests also trigger a server-side search before the model answers |
| File reading | Reads PDFs, code, text, DOCX, XLSX/XLS/ODS and other supported formats in the browser |
| Cognition code generation | Creates named code files with per-file Download buttons in chat |
| Flash code-request routing | Detects clear code-writing requests before calling Gemini and offers a one-click switch to Cognition |
| Chat history | Email accounts: saved locally in this browser, separately for each account and mode. Guests: session-only and not saved. Local history does not sync across devices. |
| Personal memory | Temporarily disabled. |

Not available on the web edition: executing generated code, opening apps, mouse/screen control, email, and YouTube. Generated files are downloaded by the user from the code cards in chat; they are not published to a remote file host automatically.

## Important notes

- A guest gets 30 messages total for that anonymous account. Creating a new anonymous account creates a separate quota.
- The limit is enforced in the database, not localStorage, so refreshing or editing browser storage does not reset it.
- Google AI free-tier model access and request limits depend on your account, region, and current Google availability. Gemini 2.5 Flash-Lite access may be restricted for some new projects. OpenRouter free model endpoints are also rate-limited and can be temporarily unavailable. “Free” does not mean unlimited.
- The free Nemotron endpoint may log requests for service/security purposes. Do not send confidential information or personal data to it.
- Keep provider API keys in Vercel server-side environment variables. Never hardcode a real API key into frontend JavaScript or a public GitHub repository.
- Email-account chat history is temporarily stored in localStorage in this browser, separately by Supabase user ID and mode; it does not sync across devices and is not server-side storage. Guests do not get persistent chat history. The user can clear the current mode’s history with **New chat**.
- A chat request has about 60 seconds on Vercel (`vercel.json`). Long tool chains may time out.
- Test the migration and endpoints against your own Supabase project before announcing the deployment.
