# Claidor Pricing

Claidor sells per-seat subscriptions to law firms, with firm tiers and a
trial, through the platform's built-in self-billing (see
`server/polar/platform/` and `server/polar/entitlements/tiers.py`).

Pricing is defined in Phase 4 of the v1 plan
([`docs/claidor-v1-plan.md`](docs/claidor-v1-plan.md)) once pilot firms are
engaged. The tier machinery currently carries the inherited Starter/Studio/
Scale structure as scaffolding; the names, limits, and prices will be replaced
by Claidor's own seat tiers before any customer is charged.
