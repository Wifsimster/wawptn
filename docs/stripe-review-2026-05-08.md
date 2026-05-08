# Stripe Integration Review — Multi-Persona Meeting

**Date:** 2026-05-08
**Branch:** `claude/stripe-review-personas`
**Scope:** Stripe / subscriptions surface (`packages/backend/src/infrastructure/stripe/`,
`packages/backend/src/presentation/routes/subscription.routes.ts`,
`packages/backend/src/infrastructure/scheduler/subscription-reconciler.ts`,
`packages/backend/src/domain/subscription-service.ts`, related migrations,
`.env.example`).
**Format:** Four security/quality personas reviewed independently in
parallel; this document is the chaired synthesis of their reports.

## Participants

| Persona | Lens |
|---|---|
| Webhook Security | Signature verification, raw-body ordering, idempotency, replay, forgery paths |
| Subscription Lifecycle | State-machine correctness, premium-grant integrity, race conditions |
| Stripe SDK Best Practices | Idempotency keys, API version pinning, error typing, retries, modern Checkout/Portal config |
| Compliance / Operational | PCI scope, GDPR, tax/VAT, secret hygiene, audit trail, observability |

A finding flagged by multiple personas is consolidated. A persona claim
checked against source and found incorrect is marked **[DISPUTED]** with
the reason. Severity comes from the chair, not the loudest persona.

---

## Executive summary

| Severity | Count | Notes |
|---|---|---|
| Critical | 0 confirmed | Webhook flagged "idempotency-on-failure" Critical; downgraded to High after Lifecycle ruled it acceptable given Stripe retry semantics (see §A1). |
| High | 14 | Cancel-at-period-end immediate revoke, no automatic_tax, no idempotency keys, no audit trail for webhook-driven grants, missing event handlers, env-validation gap. |
| Medium | ~10 | Cache invalidation, past-due grace reset, schema collapses multi-sub, error typing, GDPR delete flow. |
| Low | ~8 | Replay tolerance, promo codes, mode-mismatch guard. |

**Top three actions for the next sprint:**

1. **Fix `cancel_at_period_end` revoking premium immediately**
   (`subscription.routes.ts:195-196`, `subscription-reconciler.ts:53`).
   Today, the moment a paying user clicks "cancel" in the Billing Portal,
   `isUserPremium` returns false — they lose access to the period they've
   already paid for. Keep `status='active'` while
   `cancel_at_period_end && current_period_end > now`; track cancellation
   intent in a separate column.
2. **Add idempotency keys to every Stripe write call** + require the
   Stripe env trio together in `validateEnv()`
   (`subscription.routes.ts:60,78,109`; `env.ts:75-99`). Today a
   double-clicking user creates duplicate Stripe customers; a deploy
   with `STRIPE_SECRET_KEY` but blank `STRIPE_WEBHOOK_SECRET` 400s every
   webhook silently.
3. **Enable Stripe Tax + replace realistic placeholders in `.env.example`**
   (`subscription.routes.ts:78-85`; `.env.example:84-86`). The product
   targets a French audience (per `CLAUDE.md`) at €3/month — EU VAT
   collection is mandatory. The `.env.example` placeholders
   (`sk_test_...`, `whsec_...`, `price_...`) were already flagged D10 in
   the 2026-05-01 security review and have not been fixed.

---

## A. Confirmed findings (multi-persona consensus)

### A1. Webhook idempotency row persists on handler failure — **High**

`subscription.routes.ts:157-167, 245-248`. The handler inserts into
`stripe_events` *before* the business logic runs, outside any
transaction. If the subsequent DB update or `stripe.subscriptions.retrieve`
throws, the route returns 500 — but the dedup row is already committed.
Stripe retries land at the dedup check and return
`{received: true, duplicate: true}`; the event is silently lost. A
paying user can fail to receive `tier=premium`, or a
`subscription.deleted` can fail to revoke access.

Lifecycle persona ruled this "acceptable given Stripe retry semantics
but worth a comment". Chair sides with Webhook: the failure mode is
silent and uncorrected by anything except the once-daily reconciler,
which itself only repairs rows where `stripe_subscription_id` is
already set (see A11).

**Fix:** wrap the insert + handler in `db.transaction(...)`, or move the
insert to *after* the handler succeeds and rely on the `event_id` PK
with `INSERT … ON CONFLICT DO NOTHING` for race safety on concurrent
duplicate deliveries.

### A2. `cancel_at_period_end` revokes premium immediately — **High**

`subscription.routes.ts:195-196`, `subscription-reconciler.ts:53`,
`subscription-service.ts:80`. The webhook handler maps
`cancel_at_period_end === true` to `status='canceled'` even though
Stripe still reports `status: 'active'` until the period ends.
`isUserPremium` requires `status === 'active'`, so the user loses
premium the instant they schedule cancellation rather than at period
end. Three personas independently flagged this.

**Fix:** keep `status='active'` while
`cancel_at_period_end && current_period_end > now`. Add a separate
boolean column for cancellation intent so the UI can surface it.

### A3. No idempotency keys on any Stripe write call — **High**

`subscription.routes.ts:60, 78, 109`. `customers.create`,
`checkout.sessions.create`, `billingPortal.sessions.create` are all
called without a second `{ idempotencyKey }` request-options argument.
Combined with the check-then-create pattern at lines 52-76, two
concurrent `/checkout` requests from the same user (a double-click,
or a proxy retry) produce two Stripe customers; only the second is
persisted. The orphan can later receive subscription events via the
`stripe_customer_id` lookup in the webhook handler (line 179) and
silently update the wrong local row.

**Fix:** deterministic keys per user (`cust:${userId}`,
`co:${userId}:${priceId}`, `portal:${userId}:${dayBucket}`) plus a
unique constraint on `subscriptions.user_id` with upsert.

### A4. Event ordering not enforced — **High**

`subscription.routes.ts:193-224`. `customer.subscription.updated` and
`.deleted` blindly overwrite local state. Stripe makes no ordering
guarantee on retries: a delayed `updated` (status=active) arriving
after `deleted` re-promotes a canceled user; a stale `updated` with
status `incomplete` arriving after upgrade revokes premium.

**Fix:** either compare against the Stripe object's own version /
timestamp before writing, or always re-fetch fresh state via
`subscriptions.retrieve()` inside the handler (as
`checkout.session.completed` already does at line 176).

### A5. `checkout.session.completed` keys by `stripe_customer_id`, can update zero rows silently — **High**

`subscription.routes.ts:178-186`. The `UPDATE` is keyed only on
`stripe_customer_id = session.customer` and never asserts
`rowCount > 0`. If the local `subscriptions` row was never inserted
(e.g. `/checkout` failed mid-flight after creating the Stripe customer
at line 60), the webhook update affects zero rows — Stripe receives
200, premium is paid for, never granted.

**Fix:** key by `session.client_reference_id` (already set at line 84)
to user-scope the lookup, and upsert on miss. Consider also
propagating `subscription_data.metadata.userId` so the
`subscription.updated/deleted` handlers can identify the user from
the Subscription object alone (see A12).

### A6. Missing handlers: `customer.subscription.created`, `charge.refunded`, `charge.dispute.*`, `invoice.payment_succeeded`, `customer.subscription.trial_will_end` — **High**

`subscription.routes.ts:170-242` only handles four event types.
Consequences:
- Reactivation via Customer Portal (no Checkout) leaves the local row
  pointing at a stale `stripe_subscription_id` until a follow-up
  `updated` arrives.
- Refunds and disputes silently leave premium intact.
- `past_due → active` recovery depends on the next `updated` rather
  than `payment_succeeded`.

**Fix:** add a `created` case mirroring `updated`; add refund/dispute
handlers that flip tier to free or surface a chargeback flag.

### A7. `trialing` denies premium — **High**

`subscription.routes.ts:196`, `subscription-reconciler.ts:53-54`.
Only `stripeSub.status === 'active'` writes `tier='premium'`;
`trialing`, `incomplete`, `incomplete_expired`, `unpaid` collapse to
`past_due`+`free`. If a coupon or admin-created subscription ever
produces `trialing`, the user is denied access to a feature they have
a paid trial for.

**Fix:** treat `trialing` as a premium-granting state (or any state
where `current_period_end > now` and Stripe considers the sub valid).

### A8. No `automatic_tax` on Checkout Session — **High**

`subscription.routes.ts:78-85`. Checkout Session is created without
`automatic_tax: { enabled: true }` and without `tax_id_collection`.
The product is a €3/month subscription with a French UI; EU/UK B2C
VAT collection is mandatory. Requires Stripe Tax onboarded in the
dashboard and `tax_behavior` set on the price object.

**Fix:** `automatic_tax: { enabled: true }`,
`tax_id_collection: { enabled: true }`, confirm dashboard onboarding.

### A9. No audit trail for webhook-driven premium changes — **High**

`subscription.routes.ts:170-242`. Admin-toggled premium is recorded
via `recordAdminAction('user.premium.grant'|'.revoke')` in
`admin.routes.ts:290`, but the webhook path bypasses
`admin-audit-log.ts` entirely. There is no permanent record of
auto-grants or auto-revokes — disputes ("why did I lose premium on
2026-04-12?") cannot be answered from the database.

**Fix:** extend `admin_audit_log` with a `system` actor row inside each
webhook case, or add a dedicated `subscription_audit_log` keyed by
`stripe_event_id`.

### A10. `.env.example` D10 follow-up not fixed — **High**

`.env.example:81-83`. The 2026-05-01 review flagged realistic
placeholders (`sk_test_…`, `whsec_…`, `price_…`) as D10 / Info; on
re-verification they are still present. Realistic placeholders are
still occasionally pasted into prod env files by accident.

**Fix:** replace with `<STRIPE_SECRET_KEY>`,
`<STRIPE_WEBHOOK_SECRET>`, `<STRIPE_PRICE_ID>`.

### A11. No alerting on reconciler failures or drift — **High**

`subscription-reconciler.ts:22-103`. The daily 03:00 UTC cron logs
warn-level on per-row failures and moves on. There is no metric, no
dead-letter, no `/admin/subscription-health` endpoint exposing the
running counts of `synced / errors / drifts`. A 24h+ webhook outage
or systematic drift is invisible unless someone tails logs at the
right moment. The reconciler also only inspects rows where
`stripe_subscription_id IS NOT NULL`, so a user lost between
`stripe.customers.create` (line 60) and `checkout.session.completed`
is never repaired.

**Fix:** expose the per-run counters on a `/admin/subscription-health`
endpoint; emit `error` (not `warn`) above a threshold; extend the
reconciler to list customers with null `stripe_subscription_id` and
query `subscriptions.list({customer})` for them.

### A12. `subscription_data.metadata` propagation gap — **High**

`subscription.routes.ts:78-85`. Checkout Session sets
`client_reference_id: req.userId` but does not pass
`subscription_data: { metadata: { userId } }`. `client_reference_id`
lives only on the Checkout Session; the Subscription object inherits
nothing. The reconciler and `subscription.updated/deleted` handlers
must rely entirely on `stripe_customer_id` lookups, which is what
makes A5 silently fail.

**Fix:** also set `subscription_data: { metadata: { userId } }` and
consult it in the webhook/reconciler paths.

---

## B. Lifecycle and integrity (Medium)

| # | Location | Issue / Fix |
|---|---|---|
| B1 | `subscription.routes.ts:178-242` | **Webhooks don't call `invalidatePremiumCache`.** The 60s in-memory cache in `subscription-service.ts:43-44` keeps serving the previous tier after a grant/revoke. In multi-instance deploys, only the receiving pod is updated. **Fix:** invalidate on every webhook write; for multi-instance, use shared cache or pub/sub. |
| B2 | `subscription-reconciler.ts:96-103` | **Past-due grace reset by every Stripe retry.** Cutoff is `updated_at < now - 3d`, but every dunning retry triggers `subscription.updated` which bumps `updated_at`, allowing indefinite past_due. **Fix:** add `past_due_since` set only on the *transition* into `past_due`; key the cutoff off it. |
| B3 | `migrations/20260321_add_subscriptions.ts:6` | **`subscriptions.user_id` is `.unique()`.** A user with two Stripe subs (canceled-but-still-paid + new) collapses to one row, last-write-wins. The old sub's `subscription.deleted` can revoke premium even though the new one is active. **Fix:** drop `user_id` unique, key by `stripe_subscription_id`, aggregate at read time. |
| B4 | `subscription.routes.ts:245-248` | **Logic-bug 500s cause 3-day Stripe retry storms** (post-fix to A1 — once retries actually re-run, malformed events retry forever). **Fix:** classify errors; return 200 with logged alert for non-retryable logic errors, 500 only for transient infra. |

## C. SDK / API hygiene (Medium)

| # | Location | Issue / Fix |
|---|---|---|
| C1 | every catch in `subscription.routes.ts` and `subscription-reconciler.ts` | **No typed Stripe error handling.** `Stripe.errors.StripeCardError`, `StripeInvalidRequestError`, `StripeAPIError`, `StripeRateLimitError` are flattened into 500 with no `request_id`. Card declines surface as 500. **Fix:** branch on `err instanceof Stripe.errors.StripeError`, log `type/code/requestId`, map 4xx to 4xx. |
| C2 | `stripe-client.ts:11-13` | **No `maxNetworkRetries` or `timeout`.** Default `maxNetworkRetries=0` means a transient blip fails the reconciler for that row. **Fix:** `{ apiVersion, maxNetworkRetries: 2, timeout: 20_000 }`. |
| C3 | `subscription-reconciler.ts:50-84` | **Per-row sequential `retrieve` with no `expand`.** N premium users = N round-trips, no parallelism, no pagination. **Fix:** `subscriptions.list({ status: 'all', limit: 100 })` with auto-pagination, or bounded-concurrency parallelism. |
| C4 | `env.ts:57-99` | **`validateEnv()` does not require the Stripe trio together.** A prod deploy with only `STRIPE_SECRET_KEY` mounts the webhook route, then 400s every Stripe POST silently (`subscription.routes.ts:142`). **Fix:** if `STRIPE_SECRET_KEY` is set, require `STRIPE_WEBHOOK_SECRET` and `STRIPE_PRICE_ID`. |

## D. Compliance and operational (Medium / Low)

| # | Location | Issue / Fix |
|---|---|---|
| D1 | (nothing in repo) | **No GDPR account-deletion flow.** A future `/me DELETE` will need to call `stripe.customers.del(customerId)` and purge `stripe_customer_id`. Add a `deleteUserStripeData()` helper today so the deletion endpoint, when built, has a clean call site. |
| D2 | `infrastructure/logger/logger.ts` redact list | **Pino redaction does not cover `stripe-signature` headers or webhook event bodies.** Webhook 500 paths (`subscription.routes.ts:151,246`) log `error: String(error)`, which can include signed payload fragments via Stripe SDK error messages. **Fix:** add `req.headers.stripe-signature` and strip `event.data.object` from error logs. |
| D3 | `subscription.routes.ts:60-63` | **`customers.create` not given `email`.** Stripe receipts/invoice emails require it. Checkout collects email but doesn't propagate it to the customer record consistently. **Fix:** pass `email` at creation, or rely on Checkout's `customer_creation: 'always'` and don't pre-create. |
| D4 | `stripe-client.ts:8-13` | **No mode-mismatch guard.** A `sk_live_*` paired with `whsec_test_*` (or vice versa) silently fails signature verification with no startup error. **Fix:** assert `sk_live_/sk_test_` and `whsec_/whsec_test_` parity at boot, or at least log the mode. |
| D5 | `subscription.routes.ts:138-156` | **No per-event-type success/failure metric.** Cannot answer "have webhooks been failing for 24h" without log search. **Fix:** add `processed_at`/`status` columns to `stripe_events`; expose lag in `/admin/subscription-health` (rolls into A11). |

## E. Lower priority

- `subscription.routes.ts:149` — `constructEvent` uses Stripe's default 300s tolerance. Acceptable; document.
- `subscription.routes.ts:78-85` — no `allow_promotion_codes`, no `billing_address_collection`. Product call.
- `subscription.routes.ts:157-167` — `SELECT` then `INSERT` on `stripe_events` is not atomic; rely on `event_id` unique + `ON CONFLICT DO NOTHING` instead.
- `subscription.routes.ts:82-83, 111` — `success_url` / `return_url` use `env.CORS_ORIGIN` directly; if it ever becomes a comma list, Stripe will reject. Hardening only.
- No handler for `customer.subscription.trial_will_end` (notification only).

---

## F. Verified safe (consensus)

- **PCI scope is clean.** Card data never reaches the WAWPTN backend; only Checkout (`subscription.routes.ts:78-85`) and Billing Portal (`subscription.routes.ts:109-112`) are used. No Elements, no PaymentMethod creation.
- **Webhook signature verification is wired correctly.** `index.ts:66-68` mounts `express.raw({type: 'application/json'})` for the webhook route *before* the global `express.json()` at line 75. `subscription.routes.ts:149` calls `stripe.webhooks.constructEvent(req.body, signature, secret)` against the unparsed Buffer.
- **No client-trusted forgery path.** `/checkout` and `/portal` use `req.userId` from the authenticated session; clients cannot supply `customer_id`. Premium state is mutated only from the verified webhook, the cron reconciler (server-side), and the admin endpoint (admin-gated).
- **API version is explicitly pinned** at `'2026-02-25.clover'` in `stripe-client.ts:12` (open question: is this the intended GA channel — see G2).
- **Admin-granted premium survives Stripe events.** It lives on `users.admin_granted_premium`; `isUserPremium` and `/api/subscription/me` short-circuit before consulting `subscriptions`. `customer.subscription.deleted` cannot clobber it.
- **Local Stripe data is minimal.** Only `stripe_customer_id`, `stripe_subscription_id`, `tier`, `status`, `current_period_end`. No card metadata, last4, brand.
- **Stripe secrets are never logged.** Confirmed by grep across `infrastructure/stripe/` and `routes/subscription.routes.ts`.

---

## G. Open questions for product / ops

1. Is **Stripe Tax** onboarded in the dashboard and is `tax_behavior` set on the price object? Code-side fix (A8) is necessary but not sufficient.
2. Is `'2026-02-25.clover'` the intended pinned channel, or an accidentally-pinned preview? `clover` is a preview suffix.
3. Is the daily reconciler **singleton-safe** in a multi-instance deploy? `cron.schedule` fires on every replica today (no leader election); could double-downgrade `past_due` rows and amplifies Stripe API rate-limit pressure.
4. Are **receipt emails** enabled in Stripe dashboard settings? Code does not suppress them, but D3 means Stripe may have no email to send to.
5. What is the dispute / chargeback monitoring plan? `charge.dispute.created` is unhandled.
6. Should `/cancel-at-period-end` UI affordances be added once A2 is fixed?

---

## H. Suggested sequencing

**Sprint 1 — user-visible correctness:**
- A2 (cancel-at-period-end immediate revoke) — paying users currently lose access on click
- A3 (idempotency keys) + A12 (subscription_data.metadata)
- A8 (automatic_tax) + A10 (.env.example placeholders) — compliance follow-ups

**Sprint 2 — webhook integrity:**
- A1 (idempotency-on-failure) + A4 (event ordering) + A5 (zero-row updates)
- A6 (missing handlers: created/refunded/dispute/payment_succeeded)
- A7 (trialing as premium)
- C4 (validateEnv() Stripe trio)

**Sprint 3 — observability and lifecycle hardening:**
- A9 (audit trail for webhook-driven changes)
- A11 (reconciler alerting + null-sub-id repair)
- B1-B4 (cache invalidation, past-due grace, multi-sub schema, error classification)

**Sprint 4 — SDK polish & GDPR groundwork:**
- C1-C3 (typed errors, network retries, reconciler bulk-list)
- D1-D5 (delete-flow helper, log redaction, customer email, mode guard, per-event metric)

---

*Generated by parallel persona subagents and chaired synthesis. Findings
referencing line numbers were not all individually re-verified against
source — treat line numbers as starting points, not ground truth, except
where marked "verified" or where multiple personas converged on the same
location.*
