# Stripe Connect Migration Plan: Hosted Onboarding + Express Dashboard → Embedded Components

## Objective

Move Polar from Stripe-hosted Connect flows to embedded Connect components for:

1. Account onboarding (replace hosted `account_link` onboarding redirects)
2. Payout account operations (replace Express Dashboard login redirects)

This plan keeps Polar's current account model and Stripe account IDs, but changes session issuance and UI rendering to embedded Connect components.

---

## 1) Current Structure (Deep Audit)

### 1.1 Backend account architecture in Polar today

- Stripe connected accounts are created on Accounts v2 with `dashboard: "express"`.
- Capabilities are requested through `configuration.merchant.card_payments` and `configuration.recipient.capabilities.stripe_balance.stripe_transfers`.
- Polar retrieves account status from v2 and maps it to internal flags such as:
  - `is_details_submitted`
  - `is_charges_enabled`
  - `is_payouts_enabled`
- Onboarding link generation uses hosted Account Links (`type="account_onboarding"`).
- Payout account dashboard access uses hosted Express login links.

### 1.2 API surface today

- `POST /v1/accounts/{id}/onboarding_link` returns a hosted Stripe URL.
- `POST /v1/accounts/{id}/dashboard_link` returns a hosted Stripe URL.

### 1.3 Frontend behavior today

- UI calls hosted link endpoints and then redirects browser to Stripe.
- Re-onboarding and payout operations are outside Polar app shell.

### 1.4 What this means operationally

- Polar loses in-app control of step-level onboarding instrumentation.
- UX context switching is unavoidable.
- Hosted flows are robust, but customization is minimal.

---

## 2) Where the First Plan Was Weak (Failures / Gaps)

This section captures likely inline review concerns and concrete weaknesses in the earlier plan.

1. **Insufficient v2 include strategy**
   - Accounts v2 returns many fields as `null` unless explicitly requested via `include`.
   - A migration that relies on stale or sparse includes can misclassify account state (false negatives/positives for requirements and capabilities).

2. **No strict component policy contract**
   - The earlier plan allowed generic component toggles but did not define a server-side allowlist model.
   - Without strict validation, clients could request unsupported component/feature combinations.

3. **No session lifecycle handling details**
   - Account Sessions are short-lived and must be refreshed.
   - Prior plan did not specify retry behavior for expired/invalid client secrets or race conditions on page reload.

4. **No explicit onboarding collection strategy**
   - Stripe supports `currently_due` vs `eventually_due` (incremental vs upfront) plus `future_requirements` behavior.
   - Earlier plan did not choose defaults per flow.

5. **No policy for requirement remediation triggers**
   - Plan mentioned webhooks but did not define user-facing trigger logic from `requirements.updated` to "show embedded onboarding now".

6. **Insufficient country/capability lock analysis**
   - In Accounts v2, country mutability depends on requested capabilities and dashboard mode.
   - Prior plan did not call out country-lock implications for existing account creation logic.

7. **No ToS/privacy handling decision**
   - Embedded onboarding allows platform-specific agreement links in certain responsibility modes.
   - Plan did not define whether Polar keeps Stripe default policy links or custom legal links.

8. **No fallback decision matrix**
   - It said "keep hosted fallback" but did not define exactly when to fail open to hosted links.

9. **No rollout SLO/SLI criteria**
   - No numerical thresholds to decide when to cut over or roll back.

---

## 3) Updated Target Architecture (Specific)

### 3.1 Backend additions

Add a dedicated connect session endpoint:

- `POST /v1/accounts/{id}/connect_session`
- Request body defines a **limited scenario**, not arbitrary components. Recommended enum:
  - `onboarding`
  - `payouts`
  - `payouts_readonly` (optional)

Server maps scenario → Stripe `components` payload.

#### Recommended strict mapping

- `onboarding`:
  - `account_onboarding.enabled = true`
  - optional `collection_options` config decided by policy
- `payouts`:
  - `payouts.enabled = true`
  - `features.instant_payouts`
  - `features.standard_payouts`
  - `features.edit_payout_schedule`
  - `features.external_account_collection`

Do not let frontend pass raw component JSON.

### 3.2 Frontend additions

- Add shared `useConnectSession(accountId, scenario)` data hook.
- Add shared `ConnectEmbeddedContainer` for:
  - requesting session
  - initializing ConnectJS instance
  - handling refresh of expired session
- Onboarding screens render `ConnectAccountOnboarding`.
- Payout management screens render `ConnectPayouts` (or split components if UX requires).

### 3.3 Keep rollback path

- Hosted link endpoints remain until stability target is reached.
- UI-level fallback switches to hosted URL when:
  - account session creation fails with retriable server error
  - embedded component fails to initialize after one refresh attempt

---

## 4) Stripe-Doc Driven Design Decisions

### 4.1 Accounts v2 include discipline

When retrieving accounts for status synchronization, request all required includes used by business logic, at minimum:

- `requirements`
- relevant capability/configuration branches needed for payout/transfers status
- identity fields used for account profile consistency

If include coverage is partial, status mapping can be wrong.

### 4.2 Onboarding strategy: default incremental, configurable upfront

- Default embedded onboarding collection to `currently_due` for faster activation.
- Add policy toggle for high-risk or specific geographies to use:
  - `fields = eventually_due`
  - `future_requirements = include`

### 4.3 Requirements update handling

- Treat `v2.core.account[requirements].updated` as the trigger for re-onboarding CTA.
- If account has `currently_due` or `eventually_due`, surface in-app warning and route user to embedded onboarding page.

### 4.4 Payout component choice

- Start with `ConnectPayouts` (full component) for lowest integration complexity.
- Use granular components (`ConnectBalances`, `ConnectPayoutsList`, `ConnectPayoutDetails`) only if product needs custom layout.

### 4.5 Authentication behavior

- Keep Stripe user authentication enabled initially.
- Evaluate `disable_stripe_user_authentication` only after platform-level MFA controls are implemented and approved.

### 4.6 ToS/privacy links

- Keep Stripe default agreement links in phase 1.
- Introduce custom agreement links only with legal signoff and explicit requirement-collection responsibility review.

---

## 5) Implementation Phases (Revised)

### Phase A — Backend Session Infrastructure

1. Add schemas:
   - `AccountConnectSessionCreate` (scenario enum)
   - `AccountConnectSession` (`client_secret`, optional metadata)
2. Implement `StripeService.create_account_session(account_id, scenario)`.
3. Add `POST /v1/accounts/{id}/connect_session` endpoint with same auth constraints as existing account write endpoints.
4. Add feature flag `stripe_connect_embedded_components`.
5. Tests:
   - rejects non-stripe account types
   - rejects unauthorized account access
   - rejects unsupported scenario
   - returns `client_secret` for valid account/scenario

### Phase B — Embedded Onboarding

1. Replace onboarding redirects in:
   - account creation completion
   - finance account "continue setup"
2. Render `ConnectAccountOnboarding`.
3. Support callbacks:
   - `onExit`
   - `onStepChange` (analytics)
4. Retry one session refresh on initialization/session-expired failures.
5. Fallback to hosted onboarding link on persistent failure.

### Phase C — Embedded Payouts

1. Replace Express dashboard redirect entry points with embedded payouts view.
2. Render `ConnectPayouts` with server-controlled features.
3. Keep hosted dashboard fallback path for flagged orgs.
4. Add event instrumentation for payout interactions.

### Phase D — Requirement Sync + UX Recovery

1. Harden webhook to account-sync pipeline for requirement updates.
2. Add account-level "action required" banner and route.
3. Ensure repeated account sessions are safe and idempotent from client perspective.

### Phase E — Controlled Cutover

1. Internal rollout.
2. 5% org rollout.
3. 25% org rollout.
4. 100% rollout and remove hosted UI entry points.

---

## 6) Failure Modes and Mitigations

### Failure mode A: Wrong account status because of missing `include`

- **Impact:** Users may be shown complete/active state while requirements are due.
- **Mitigation:** Centralize include list constants and reuse in all v2 retrieve/update code paths.

### Failure mode B: Session expires mid-render

- **Impact:** Embedded component fails to load.
- **Mitigation:** One automatic refresh attempt for session issuance; then fallback UI.

### Failure mode C: Unsupported feature combinations for payouts

- **Impact:** Stripe rejects account session creation.
- **Mitigation:** Scenario-based server mapping and feature allowlist only.

### Failure mode D: Account not eligible for instant payouts

- **Impact:** Partial payout controls unavailable.
- **Mitigation:** Keep `standard_payouts` path always enabled; hide instant-specific UX if unavailable.

### Failure mode E: Country/capability mismatch from creation defaults

- **Impact:** Onboarding friction or blocked updates.
- **Mitigation:** Confirm country-lock behavior against current create-account policy before rollout; document immutable fields for support.

### Failure mode F: Webhook delay causes stale UI state

- **Impact:** User sees outdated "all good" state.
- **Mitigation:** On entering finance/onboarding routes, fetch latest account status directly and not only cached org state.

---

## 7) API Contract Proposal

### Endpoint

`POST /v1/accounts/{id}/connect_session`

### Request

```json
{
  "scenario": "onboarding"
}
```

or

```json
{
  "scenario": "payouts"
}
```

### Response

```json
{
  "client_secret": "cas_xxx_secret_xxx"
}
```

### Error model

- `404` account not found or not accessible
- `409` feature disabled for organization
- `422` unsupported scenario for account state
- `502` upstream Stripe transient failure

---

## 8) Observability and Rollout Gates

Track at minimum:

- connect_session.create.success_rate
- connect_session.create.p95_ms
- embedded.component.init.success_rate
- onboarding.exit_before_completion_rate
- payouts.component.error_rate
- hosted_fallback_rate

Cutover gates:

- session create success rate ≥ 99.5%
- embedded init success rate ≥ 99.0%
- hosted fallback rate ≤ 1.0% over 7 days

---

## 9) Testing Plan

### Backend

- Unit tests for scenario → component mapping.
- Endpoint tests for auth and validation behavior.
- Service tests for Stripe API error translation.

### Frontend

- Component tests for:
  - session loading state
  - refresh-once behavior
  - fallback-to-hosted behavior
- E2E flow checks:
  - new account onboarding start
  - existing account requirements remediation
  - payout settings interaction

### Manual staging checks

- Account with currently due requirements.
- Account with eventually due only.
- Account with instant payout ineligible state.
- Session-expired simulation (force refresh behavior).

---

## 10) Definition of Done

- Default user path uses embedded onboarding for setup + remediation.
- Default user path uses embedded payouts (no Express dashboard redirect).
- Hosted flows remain only behind rollback feature flag.
- SLO gates met for at least 7 consecutive days before removing hosted paths.
