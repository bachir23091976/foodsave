# Dynamic pricing controlled rollout

## Gate contract

`FOODSAVE_DYNAMIC_PRICING_ENABLED=true` is the only enabling value. Absent,
empty, `false`, other casing, whitespace, and all other values mean OFF.
This is a backend activation gate, not a price formula selector. No frontend
environment variable is needed. `/offers/capabilities` returns only the boolean
`dynamicPricingAvailable` with `Cache-Control: no-store`. Older backends return
no capability; newer merchant pages hide controls in that case or on failure.
The owner-only offers response carries the same capability.

OFF rejects all pricing configuration writes, including disabling an existing
configuration, and new quotes/Checkout creation for enabled dynamic offers.
It does not alter stored configurations, inventory, existing snapshots or paid
orders. Public cards still display the correctly calculated dynamic price.
Fixed-price creation and checkout continue. Existing Checkout sessions can
still be paid/confirmed at their original snapshot price; OFF does not revoke
sessions or reverse financial actions. In-flight operations accepted before a
gate transition may finish. Wait for previous instances/requests to drain.

## Controlled deployment (not executed by this document)

1. Before pushing, verify the gate is absent or explicitly `false` on every
   backend instance. Push the complete branch, including the gate commit, not
   the earlier ungated feature commit on its own. The configured build command
   `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
   applies the additive migration before new code starts. Old code tolerates
   the additional table. No configuration rows are backfilled.
2. Verify the migration succeeded, every serving backend runs the gated release,
   old instances have drained, frontend health is normal, and capability is
   false. Verify fixed-price behavior using a controlled approved TEST flow.
   Frontend and backend deployment need not be simultaneous. Do not activate
   based solely on one healthy instance or one capability response.
3. Only then set the backend gate to exactly `true` using the normal authorized
   deployment process. Verify all instances are on dynamic-aware code. During
   OFF/ON overlap, OFF instances may reject dynamic requests, but neither uses
   fixed pricing for enabled dynamic offers. Do not open broad merchant use
   until the ON rollout has completed.
4. Verify one controlled merchant-owned TEST offer, customer quote/review,
   snapshot accounting, private-field exclusion and existing refund behavior.
   Then authorize broad merchant use. Do not use real payments as an automatic
   deployment smoke test.

## Rollback

Migration present with no dynamic configurations is compatible with old code.
ON with no configurations is also reversible after pausing activation. Once
configurations exist, the pre-feature backend cannot safely price them.

1. Prefer rolling forward or retaining this gated version with the gate OFF.
   Roll OFF across every serving backend and drain ON instances/in-flight
   requests. Verify dynamic configuration writes and new dynamic checkouts are
   rejected. Existing accepted sessions retain their immutable prices.
2. Do not deploy old code while any enabled dynamic configuration references an
   unexpired offer (`pickupEnd > database now`), even if quantity is zero: later
   inventory restoration could make it purchasable. The safest minimal path is
   to keep gated code running OFF until every such pickup window has ended.
   Verify this condition with an authorized read-only production audit before
   rollback; never infer it from hidden controls or an empty public list.
3. Keep merchant offer/configuration writes operationally paused across an old
   frontend/backend rollback; stale browser tabs may retain old controls. Verify
   no new configurations can be created and all old/new instances have drained.
   Only after the unexpired-enabled count is zero may pre-feature code resume.
   Do not merely flip configuration.enabled to false: that changes future pricing
   to the starting fixed price. Do not delete configurations or reprice snapshots.
4. Leave the additive table and immutable snapshots in place. No down migration,
   historical backfill, automatic refunds, inventory changes or credential changes
   are part of rollback. If the above conditions cannot be demonstrated, retain
   the gated code OFF; rollback to the pre-feature version is not authorized.

The environment gate cannot protect against deployment of code predating the
gate. These activation/drain/rollback checks remain mandatory operational steps.
