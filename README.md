# Babbo

A mobile-first pilot for dads of children aged 0–3 in Amsterdam. A dad can talk through a difficult moment, choose a next step, and keep track of it without inviting a partner into the app.

## What is in the MVP

- Email and password accounts with PBKDF2 password hashes, HttpOnly session cookies, same-origin mutation checks, and user-scoped D1 queries.
- Four short, skippable onboarding prompts for children’s ages and multiples, family setup, current challenges, language, and reminder preference. The last two personal fields are saved only with an explicit opt-in. The profile remains editable.
- Private text conversations. Tap-to-speak uses the browser's Web Speech API; its result is placed in the editable message box, and is sent only when the dad taps **Send**. Audio is not uploaded or stored. Browser support varies; typing always works. Replies can be read aloud with browser speech synthesis.
- A small, reviewed set of guidance for overwhelm, family load, supporting a partner, baby crying, toddler behavior, and loneliness. Ambiguous prompts ask a clarifying question. Urgent and clinical prompts route to qualified help. Toddler and baby guidance links to American Academy of Pediatrics sources.
- Cloudflare Workers AI can rephrase non-clinical, non-developmental guidance using the dad's saved profile and explicit memories. Developmental, urgent, and clinical replies always use the reviewed text. If AI is unavailable, Babbo returns the reviewed guidance directly. Task suggestions come from the reviewed guidance, never directly from model output.
- Confirmed one-time, daily, and weekly commitments; a Today view; in-app reminders; optional email reminders via Resend and a Cloudflare Cron Trigger. Changes, completion, and deletion each require confirmation.
- Conversation, memory, task, and full-account deletion. Product event names and timestamps are saved without message content.

## Stack and choices

A static HTML/CSS/JavaScript frontend is served by a Cloudflare Worker assets binding. The same Worker handles the API, Workers AI, a scheduled reminder job, and a D1 SQLite database. This keeps the pilot deployable as one Worker and avoids a client framework/build dependency. `wrangler.jsonc` is the production configuration; `wrangler.local.jsonc` omits the AI binding so local development works without Cloudflare credentials. The interface is currently English; `language` is stored as `en` or `nl`, speech locale follows it, and guidance generation can answer in Dutch. Full Dutch copy needs review before a Dutch-language pilot.

## Local setup

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run db:local
npm run dev
```

Open <http://127.0.0.1:8787>. The local Worker returns reviewed guidance without Workers AI. For unit tests run `npm test`. With the dev server running, run `npm run test:integration` to test registration, onboarding, guidance, confirmation, account isolation, recurring completion, conversation deletion, and account deletion.

## Cloudflare deployment

1. The Babbo D1 database has been created in the EU jurisdiction and its ID is configured in both Wrangler files. The verified Cloudflare account ID is configured in `wrangler.jsonc`. Sign in with `npx wrangler login` if the deployment credential expires. Never put service secrets in either config file.
2. Apply the remote schema: `npm run db:remote`.
3. Deploy: `npm run deploy`. Wrangler publishes the Worker, static assets, AI binding, and hourly Cron Trigger. Set a route or custom domain in Cloudflare if desired.
4. Optional email reminders: verify a sending domain with Resend, set `REMINDER_FROM_EMAIL` as a Worker variable and `RESEND_API_KEY` with `npx wrangler secret put RESEND_API_KEY`. Without both values, email reminders are not sent. In-app reminders continue to work. For a pilot without email delivery, ask dads to select **In Babbo**.

The Worker was deployed to `https://babbo.babbo.workers.dev` on 16 September 2026. Cloudflare account access is required for later deployments; a GitHub repo push alone does not deploy this app. Review Cloudflare's D1 location and data-processing settings for the pilot's privacy requirements before inviting real users.

## Privacy and safety notes

Every database read and mutation for private content is scoped to the authenticated user. Conversations, messages, profile data, actions, memories, sessions, and event rows are deleted with account deletion. Backups held by infrastructure providers may have separate retention periods. This MVP does not include password reset, email verification, abuse-rate limiting, partner accounts, or community features; add those and conduct a security/privacy review before a broader public launch. The service is a supportive parenting guide, not medical care or therapy. If anyone is in immediate danger in the Netherlands, call 112; 113 Zelfmoordpreventie supports suicidal crises at 113 or 0800-0113.

Grounding sources: [AAP tantrum guidance](https://www.healthychildren.org/English/family-life/family-dynamics/communication-discipline/Pages/Temper-Tantrums.aspx), [AAP crying baby guidance](https://www.healthychildren.org/English/ages-stages/baby/crying-colic/pages/Calming-A-Fussy-Baby.aspx), [Dutch emergency number](https://www.government.nl/themes/justice-security-and-defence/emergency-number-112), [113 Zelfmoordpreventie](https://www.113.nl/english).

## Pilot walkthrough

1. Create an account, enter “twins, 8 months,” describe the family setup and current challenge, and choose whether to save the personal answers.
2. Go to **Talk**, tap the microphone in a supported browser, say “We keep arguing about the family load,” review or edit the transcript, then tap **Send**. Typing the same text exercises the server path in environments without a microphone.
3. Read the guidance, choose **Review & confirm**, keep or edit the proposed weekly responsibility and due date, and confirm it.
4. See the recurring responsibility in **Today**. Mark it done to move its due date forward a week.
5. Visit **My space** to edit what Babbo remembers or delete the account; delete individual conversations in **History**.
