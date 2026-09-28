# Lane Owner Management

Shows who is waiting on us and for how long, and which follow-ups we have promised. Next.js 16 and Supabase, in the same project as the cleaning app. Read `docs/ARCHITECTURE.md` before changing anything.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

The database schema is in `supabase/migrations/20260928000000_owner_management.sql`. After a schema change, regenerate the types with `npm run db:types`.

### Environment

| Variable | What it is for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project `yvohdlsbjjzsvrxblwoc` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Used by ingestion, cron jobs, webhooks and the seed |
| `CRON_SECRET` | Shared secret for `/api/cron/*`. Send it as `Authorization: Bearer …` or `?secret=` |
| `INTEGRATIONS_MODE` | `mock` (default) runs every integration from the seed dataset; `live` calls the real APIs |
| `ANTHROPIC_API_KEY` | Classification, summaries, drafts and follow-up extraction. Without it, heuristics are used |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client used when each staff member connects their Gmail |
| `DIALPAD_API_KEY`, `DIALPAD_WEBHOOK_SECRET` | Pulling calls and texts, sending texts, and verifying webhooks |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`, `MASTER_SHEET_ID` | Master Sheet sync (owners, contacts, properties) |
| `MAINTENANCE_SHEET_ID` | Optional. Read maintenance from the sheet instead of `public.issues` |
| `MASTER_SHEET_HEADERS`, `MAINTENANCE_SHEET_HEADERS` | Optional JSON header overrides, e.g. `{"ownerEmail":"Owner e-mail"}` |
| `AUTO_MAINTENANCE_EMAILS` | `true` to email the owner from their PM when an issue is resolved |
| `RESLY_API_KEY`, `NPS_WEBHOOK_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Resly, surveys and web push |

## Google sign-in and Gmail

1. In Google Cloud, create an OAuth client (type: web application) in the Lane Workspace. Set it to **Internal** so only laneproperty.com.au accounts can use it.
2. Enable the **Gmail API** and the **Google Sheets API**.
3. Add these authorised redirect URIs:
   - `https://yvohdlsbjjzsvrxblwoc.supabase.co/auth/v1/callback` (Supabase sign-in)
   - `https://<your-domain>/api/integrations/gmail/callback` and `http://localhost:3000/api/integrations/gmail/callback` (Gmail connect)
4. In Supabase, go to **Authentication > Providers > Google**, turn it on, and paste the client id and secret. Under **URL configuration**, add `https://<your-domain>/auth/callback` and `http://localhost:3000/auth/callback`.
5. Put the same id and secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
6. Each PM opens **Settings > Connect Gmail**. This asks for `gmail.modify` and `gmail.send` with offline access and stores the refresh token on `lane_staff.gmail_refresh_token`. If Google does not return a refresh token, remove the app's access at myaccount.google.com and connect again.

Staff must be listed in `lane_staff_invites` (the seed adds them). They are linked to a `lane_staff` row the first time they sign in with Google.

## Dialpad

1. Create an API key in Dialpad admin under **Integrations > API keys** and set `DIALPAD_API_KEY`.
2. Create a webhook pointing at `https://<your-domain>/api/webhooks/dialpad` with a secret, and set that secret as `DIALPAD_WEBHOOK_SECRET`. Dialpad signs payloads as HS256 JWTs. A JSON body with an `x-dialpad-signature` HMAC-SHA256 header is also accepted.
3. Subscribe that webhook to call events (states `hangup`, `missed`, `voicemail`) and to SMS events (inbound and outbound) for the company.
4. Set each staff member's `dialpad_user_id` on `lane_staff_invites` or `lane_staff`, so calls and texts are credited to the right PM.

The cron job also pulls calls and texts from the REST API as a backstop. Webhook and cron are both idempotent, because interactions are unique on channel plus external id.

## Seed data (mock mode)

```bash
npm run seed                               # replaces owners created by a previous seed
SEED_RESET=true npm run seed               # empties every lane_ data table first
SEED_STAFF_AS_USERS=true npm run seed      # also creates auth users for the six staff
```

The seed script:

- adds Priya Nair, Tom Reyes and Mia Chen (PMs), Alex Hart (GM), and Liam Hukins and Dan Lane (directors) to `lane_staff_invites`
- creates about 30 owners, each linked to a real active row in `public.properties`
- adds about 200 interactions from the last 60 days
- adds 12 open loops: a few past their time, and one missed call that was texted but not called
- adds about 25 follow-ups, 3 outreach tasks and 6 survey responses

It never writes to `properties`, `issues` or `reservations`. Seeded owners carry `hubspot_contact_id = seed-owner-N`, so re-running replaces only seeded owners.

Owners are only assigned to PMs who exist in `lane_staff`. That means the PMs have signed in, or you ran the seed with `SEED_STAFF_AS_USERS=true`. Created users get a random password and are meant for local or demo use; real staff sign in with Google.

In mock mode, each run of the ingest cron pulls a few new events built from the seeded owners (a new owner email, an auto-reply that is ignored, a missed call, a text), so the queue keeps moving.

## Cron

Set these up as Vercel cron jobs (`vercel.json`). Each one sends `Authorization: Bearer $CRON_SECRET`.

| Path | Schedule | What it does |
| --- | --- | --- |
| `/api/cron/ingest` | every 5 min | Gmail (every connected inbox), Dialpad, maintenance issues and Master Sheet sync; AI enrichment; one note per loop that has passed its time |
| `/api/cron/commitments` | every 15 min | Suggests follow-ups from new outbound mail and calls, closes the ones they cover, and drafts updates for late ones |
| `/api/cron/enrich` | every 5 min | Classifies and drafts replies for new inbound interactions |
| `/api/cron/notify` | daily 5pm Brisbane (07:00 UTC) | Daily PM summary, director alert and Monday digest |

To run ingest by hand: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/ingest`.

## Scripts

- `npm run dev`: start the dev server
- `npm run typecheck`: run `tsc --noEmit`
- `npm test`: run the vitest domain tests
- `npm run seed`: seed the database (see above)
- `npm run db:types`: regenerate `src/lib/domain/database.ts`
