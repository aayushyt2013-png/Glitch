# Glitch web edition: checklist

## Current features
- [x] Flash (Gemini 2.5 Flash-Lite free tier) and Cognition (NVIDIA Nemotron 3 Ultra free)
- [x] Supabase email + password sign-in and anonymous guest sessions
- [x] Guest quota: 30 messages per guest account, enforced by atomic Supabase RPC
- [x] Web search tool available in both modes through Google Search grounding
- [x] Upload, download, file listing, file generation, and file-reading features removed
- [x] Browser layout remains mobile-friendly
- [x] Optional `ALLOWED_EMAILS` allow-list

## Setup / deployment
- [ ] Supabase: run the updated `supabase.sql`
- [ ] Supabase: enable Anonymous Sign-Ins if guests should be allowed
- [ ] Vercel env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY` (+ optional `ALLOWED_EMAILS`)
- [ ] Redeploy Vercel
- [ ] Smoke test: register/sign in, send messages in both modes, test web search
- [ ] Test guest quota reaches 0 after 30 successful guest requests and rejects the next request
- [ ] Confirm direct Storage access is denied by the removed Storage policies

## Notes
- The OpenRouter free endpoint has provider-side rate limits and availability constraints.
- Provider keys must remain server-side; never commit real keys.
- Old objects in the private Supabase Storage bucket are not automatically deleted by the migration.

- [ ] Verify Google Search is available in both Flash and Cognition; ask each mode for current news and confirm source URLs are included.


## Temporary local chat history (no memory feature)
- [x] Remove the My memory UI and memory prompt injection.
- [x] Email-account chat history is stored in this browser's localStorage, separately by user ID and mode.
- [x] Guest chat history is not persisted.
- [ ] Sign in with email account A, send messages in Flash and Cognition, and verify each mode restores its own history after refresh.
- [ ] Sign out and sign in as account B in the same browser; verify B sees a separate history.
- [ ] Verify history does not sync to another browser/device (temporary limitation).
- [ ] Verify New chat clears the current mode's local history.
