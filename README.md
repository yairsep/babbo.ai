# Babbo

A mobile-first pilot for dads of children aged 0–3 in Amsterdam. A dad can talk through a difficult moment, choose a next step, and keep track of it without inviting a partner into the app.

## What is in the MVP

- Email and password accounts with PBKDF2 password hashes, HttpOnly session cookies, same-origin mutation checks, and user-scoped Postgres queries.
- Four short, skippable onboarding prompts for children’s ages and multiples, family setup, current challenges, language, and reminder preference. The last two personal fields are saved only with an explicit opt-in. The profile remains editable.
- Private text conversations. Tap-to-speak uses the browser's Web Speech API; its result is placed in the editable message box, and is sent only when the dad taps **Send**. Audio is not uploaded or stored. Browser support varies; typing always works. Replies can be read aloud with browser speech synthesis.
- A small, reviewed set of guidance for overwhelm, family load, supporting a partner, baby crying, toddler behavior, and loneliness. Ambiguous prompts ask a clarifying question. Urgent and clinical prompts route to qualified help. Toddler and baby guidance links to American Academy of Pediatrics sources.
- Cloudflare Workers AI can rephrase non-clinical, non-developmental guidance using the dad's saved profile and explicit memories. Developmental, urgent, and clinical replies always use the reviewed text. If AI is unavailable, Babbo returns the reviewed guidance directly. Task suggestions come from the reviewed guidance, never directly from model output.
- Confirmed one-time, daily, and weekly commitments; a Today view; in-app reminders; optional email reminders via Resend and a Cloudflare Cron Trigger. Changes, completion, and deletion each require confirmation.
- Conversation, memory, task, and full-account deletion. Product event names and timestamps are saved without message content.

## Stack and choices

A static HTML/CSS/JavaScript frontend is served by a Cloudflare Worker assets binding. The same Worker handles the API, Workers AI, and a scheduled reminder job. Data lives in **Postgres on Supabase**, reached through **Cloudflare Hyperdrive** (a connection pooler/accelerator, not a database itself) using the `postgres` (postgres.js) driver. This keeps the pilot deployable as one Worker, avoids a client framework/build dependency, and — unlike Cloudflare D1 (the original choice, since replaced) — gives a real Postgres endpoint that any standard SQL client (DataGrip, psql, TablePlus, …) can connect to directly for local inspection. `wrangler.jsonc` is the production configuration; `wrangler.local.jsonc` omits the AI binding so local development works without a Workers AI entitlement. The interface is currently English; `language` is stored as `en` or `nl`, speech locale follows it, and guidance generation can answer in Dutch. Full Dutch copy needs review before a Dutch-language pilot.

Both `wrangler.jsonc` and `wrangler.local.jsonc` reference the same Hyperdrive config (`babbo-pg`), which stores the Supabase connection string encrypted on Cloudflare's side — it is never written into a committed file. Local development instead points `wrangler dev` straight at Supabase (bypassing Hyperdrive's edge pooling) via a `localConnectionString`-equivalent environment variable, loaded from the git-ignored `.dev.vars`.

## Local setup

Requirements: Node.js 20+ and npm, and a Supabase (or any Postgres) database.

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in your own Postgres connection string
DATABASE_URL='<your connection string>' npm run db:migrate
npm run dev
```

Open <http://127.0.0.1:8787>. The local Worker returns reviewed guidance without Workers AI. For unit tests run `npm test`. With the dev server running, run `npm run test:integration` to test registration, onboarding, guidance, confirmation, account isolation, recurring completion, conversation deletion, and account deletion.

## Cloudflare deployment

1. Create a Postgres database (this pilot uses [Supabase](https://supabase.com)). Grab its connection string from **Project Settings → Database → Connection string**.
2. Apply the schema: `DATABASE_URL='<connection string>' npm run db:migrate`.
3. Create the Hyperdrive config (one-time; Wrangler verifies connectivity before succeeding): `npx wrangler hyperdrive create babbo-pg --connection-string="<connection string>" --caching-disabled`. Copy the resulting `id` into the `hyperdrive` block of both Wrangler files if it differs from what's already committed. Caching is disabled because several flows read immediately after writing (e.g. register → read profile); Hyperdrive does not invalidate cached reads on write.
4. The verified Cloudflare account ID is configured in `wrangler.jsonc`. Sign in with `npx wrangler login` if the deployment credential expires. Never put service secrets in either config file.
5. Deploy: `npm run deploy`. Wrangler publishes the Worker, static assets, AI binding, Hyperdrive binding, and hourly Cron Trigger. Set a route or custom domain in Cloudflare if desired.
6. Optional email reminders: verify a sending domain with Resend, set `REMINDER_FROM_EMAIL` as a Worker variable and `RESEND_API_KEY` with `npx wrangler secret put RESEND_API_KEY`. Without both values, email reminders are not sent. In-app reminders continue to work. For a pilot without email delivery, ask dads to select **In Babbo**.

The Worker is deployed to `https://babbo.babbo.workers.dev`. Cloudflare account access is required for later deployments; a GitHub repo push alone does not deploy this app. **Confirm the Supabase project's region before inviting real Amsterdam users** — the original D1 database was explicitly provisioned in the EU for GDPR reasons, and that choice needs to be re-made for whichever Supabase region the project was created in (Project Settings → General → Region).

## Connecting a SQL client (DataGrip, psql, etc.)

Because the database is real Postgres, any standard client connects with the same connection string used above:

- **Host/port**: from the Supabase connection string (`db.<project-ref>.supabase.co`, port `5432` for a direct connection, or Supabase's **Session pooler** host/port if your network blocks direct Postgres).
- **Database**: `postgres`
- **User**: `postgres` (or `postgres.<project-ref>` if using the pooler)
- **Password**: your Supabase database password
- **SSL**: required

In DataGrip: **New Data Source → PostgreSQL**, fill in the fields above, test the connection, and download the driver if prompted.

## Privacy and safety notes

Every database read and mutation for private content is scoped to the authenticated user. Conversations, messages, profile data, actions, memories, sessions, and event rows are deleted with account deletion. Backups held by infrastructure providers may have separate retention periods. This MVP does not include password reset, email verification, abuse-rate limiting, partner accounts, or community features; add those and conduct a security/privacy review before a broader public launch. The service is a supportive parenting guide, not medical care or therapy. If anyone is in immediate danger in the Netherlands, call 112; 113 Zelfmoordpreventie supports suicidal crises at 113 or 0800-0113.

Grounding sources: [AAP tantrum guidance](https://www.healthychildren.org/English/family-life/family-dynamics/communication-discipline/Pages/Temper-Tantrums.aspx), [AAP crying baby guidance](https://www.healthychildren.org/English/ages-stages/baby/crying-colic/pages/Calming-A-Fussy-Baby.aspx), [Dutch emergency number](https://www.government.nl/themes/justice-security-and-defence/emergency-number-112), [113 Zelfmoordpreventie](https://www.113.nl/english).

## Pilot walkthrough

1. Create an account, enter “twins, 8 months,” describe the family setup and current challenge, and choose whether to save the personal answers.
2. Go to **Talk**, tap the microphone in a supported browser, say “We keep arguing about the family load,” review or edit the transcript, then tap **Send**. Typing the same text exercises the server path in environments without a microphone.
3. Read the guidance, choose **Review & confirm**, keep or edit the proposed weekly responsibility and due date, and confirm it.
4. See the recurring responsibility in **Today**. Mark it done to move its due date forward a week.
5. Visit **My space** to edit what Babbo remembers or delete the account; delete individual conversations in **History**.
