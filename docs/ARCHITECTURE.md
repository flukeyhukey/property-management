# Lane Owner Management System

An accountability engine with owner context attached. It answers two questions at all times:

1. Which owners are waiting on us, and for how long?
2. Which promises have we made, and have we kept them?

Two rules govern everything:

- **Accountability is automatic.** Clocks and closures are driven by data the system already sees. A PM cannot stop a clock, only satisfy it.
- **The PM never does data entry.** If Gmail, Dialpad, Resly or the sheets already hold it, the system takes it. The PM's only actions are call, reply, and tap yes.

## Tone (non-negotiable)

PM-facing copy reads as help, never surveillance. Never use "accountability", "SLA", "overdue", "escalated", "missed", "notified" in the UI. Say how long the *owner* has been waiting ("Waiting 1h 38m", "18m left"). Promises are "follow-ups". A late follow-up shows "Draft ready", not "Missed". Red is only ever an owner's health colour; a PM's own numbers are never red. Escalation (rerouting calls, 24h/48h handovers to Alex/Liam/Dan) was **cut** from the brief: loops stay with their PM until closed.

## Stack

- Next.js 16 (App Router, `src/`), TypeScript, Tailwind v4. Read `node_modules/next/dist/docs/` before using an API you are unsure of: middleware is `proxy.ts`, page props are `PageProps<"/route">` only after route types exist (use an explicit `searchParams: Promise<...>` type otherwise).
- Supabase (project `yvohdlsbjjzsvrxblwoc`, shared with the cleaning app). All owner tables live in `public` with prefix `lane_`. Schema: `supabase/migrations/20260928000000_owner_management.sql`. Generated types: `src/lib/domain/database.ts`; friendly aliases: `src/lib/domain/types.ts`.
- `lane_properties`, `lane_issues`, `lane_reservations` are read-only views over the cleaning app's tables. Never write to `properties`, `issues` or `reservations`.
- Business hours: `src/lib/domain/time.ts` (mirrors the `lane_*` SQL functions). Brisbane, 8am to 6pm, Monday to Friday.
- Auth: Google sign-in restricted to laneproperty.com.au. `requireStaff()` in `src/lib/auth.ts` at the top of every page, action and route. Roles: `pm`, `gm`, `director`.
- Supabase clients: `createClient()` (`src/lib/supabase/server.ts`, staff session, RLS) for pages and actions; `createAdminClient()` (`src/lib/supabase/admin.ts`, service role) for ingestion, cron and webhooks only.
- Integrations run in `mock` or `live` mode (`INTEGRATIONS_MODE`, see `src/lib/env.ts`). Every adapter has both. Mock mode reads the seed dataset so the whole app works without credentials.
- AI: Anthropic SDK, `claude-sonnet-5` for classification/summaries/drafts, in `src/lib/ai/`. Without `ANTHROPIC_API_KEY`, heuristics stand in.

## Layout of the code

```
src/app/(app)/queue        PM home: loops, follow-ups, catch-ups
src/app/(app)/loops/[id]   Reply screen (drafted reply, detected follow-ups)
src/app/(app)/owners       Owner list and Owner 360
src/app/(app)/dashboard    Team dashboard
src/app/(app)/settings     Gmail connect, push notifications
src/app/api/cron/*         Scheduled jobs (Vercel cron), protected by CRON_SECRET
src/app/api/webhooks/*     Dialpad, NPS, Gmail push
src/lib/domain/*           Pure domain logic: loops, commitments, health, cadence
src/lib/integrations/*     gmail, dialpad, resly, sheets, nps, hubspot adapters (mock + live)
src/lib/ai/*               classify, summarise, draft, extract commitments, match evidence
src/lib/queries/*          Read helpers used by pages
src/lib/actions/*          Server actions used by the UI
scripts/seed.ts            Seed dataset (owners, interactions, loops, commitments)
```

## Domain rules

### Loops
Open on: inbound owner email, missed owner call, inbound owner SMS, new maintenance issue on their property (category maintenance/damage), NPS 0–6, Resly trigger.
Close on: email → outbound email in that thread (auto-replies never close); missed call → outbound call, answered or voicemail (an SMS sets `texted_not_called` but does not close); SMS → outbound SMS or call; maintenance → owner told the outcome (an outbound email/call/SMS to that owner mentioning the issue, or the automatic status email); detractor → outbound call by a director; manual close → reason from `CLOSE_REASONS`, shown on the dashboard as "closed by hand".
Clocks (business minutes): missed call 60, SMS 60, email 240, maintenance end of business day, detractor 24 clock hours. Past due: loop sorts to the top, one push notification to the PM. That is all.

### Commitments
AI extracts promises from outbound emails and call transcripts → `status = suggested`. PM taps "Remind me" → `open`. "Add a follow-up" button on any reply/call. Closes automatically when a later outbound email/call to that owner matches (AI confirms) → `kept`, `close_kind = evidence`. If unsure: one prompt "Did your call to Sarah cover the plumber quote? Yes / No / Not yet" → `confirmed`. Manual close needs a one-line reason → `manual`, shown on dashboard. Maintenance-linked commitments close when the issue status changes. At due date with no evidence → `missed`, app drafts an honest update email with a new date; sending it or logging a call reopens the commitment with the new date (`reopened_from_id`). Two missed to the same owner in 90 days → owner health amber.

### Health score
Inputs: latest NPS, open loops and age, average response lag 90 days, email sentiment, occupancy vs `expected_occupancy`, missed commitments 90 days, churn phrases (`CHURN_PHRASES`). Output green/amber/red with the top reason in plain, kind words ("Frustrated about a repair" not "Churn risk").

### Cadence
Green owners: contact every 90 days. Amber, red and first-90-day owners: every 30 days. Outreach tasks carry a talking point from Resly data.

### Resly triggers (each opens a loop or outreach task, deduped in `lane_resly_events`)
Next-30-day occupancy below forecast; review ≤ 3 stars; cancellation of a high-value booking; property status change.

### NPS
Quarterly pulse; 30 days after onboarding; when a maintenance issue closes. Detractors open a loop assigned to a director.

### Notifications
Daily 5pm push to each PM: loops open, follow-ups due tomorrow. Daily director alert: new detractors only. Weekly Monday digest to everyone, identical content, trend vs last week.

## Conventions

- Server Components fetch; Server Actions mutate; both call `requireStaff()` first.
- Keep copy in the components, sentence case, plain words, no exclamation marks. Headlines end with a harbour full stop (`<Headline>`).
- Real `<button>`/`<a>`, 44px touch targets, no emoji, Lucide icons via `src/components/ui/icons.tsx`.
- Tailwind tokens: `bg-navy text-on-navy`, `text-ink-78`, `border-hairline`, `bg-harbour-tint`, `text-amber`, `text-error` (owner health only), `rounded-[6px]` controls, `rounded-[12px]` cards.
- Tests: vitest, `src/**/*.test.ts`, for pure domain logic.
