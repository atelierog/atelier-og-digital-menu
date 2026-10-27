# Mandatory QA Policy

For every significant feature or dashboard release, do not mark it complete until a minimum of 100 simulation cases have run.

## Required test layers

1. **Frontend/UI:** each visible control must invoke a real handler, show loading/success/error states, prevent duplicate submissions, and render persisted results after refresh.
2. **Backend/API:** verify authentication, authorization, input validation, success responses, error codes/messages, and failure cleanup for every affected Edge Function or API route.
3. **Database:** verify RLS policies and grants, inserts/updates/deletes, uniqueness/foreign keys, tenant isolation, status transitions, and rollback behavior.
4. **Integration:** verify frontend request -> backend -> database -> returned response -> refreshed UI. Test real email delivery or other external services separately.
5. **Regression:** confirm unrelated screens and workflows remain unchanged; review production logs and confirm deployment health.
6. **Safety:** use isolated test fixtures and roll back/delete test data. Never use real tenant/customer data for simulation. Permanent deletion must be guarded and explicitly confirmed.

## 100-case minimum

Use a mix of:
- 30 successful-path scenarios
- 20 validation/invalid-input scenarios
- 15 permission/role scenarios
- 15 lifecycle/state-transition scenarios
- 10 failure/retry/rollback scenarios
- 10 regression/mobile scenarios

Adapt the mix to the feature, but retain 100 total cases. Record actual counts, failures, environment, commit/deployment, and any untested manual steps. Database-only simulations do not count as full end-to-end UI/API tests.

## Business lifecycle expectations

- Create business and assign modules.
- Suspend and reactivate business.
- Archive business.
- Permanently delete only when safe; refuse deletion when operational data exists and offer archive instead.
- Suspended/archived tenants cannot access the business workspace.
- Manager creation must verify the business with a service-role client only after authenticating and authorizing the Super Admin.
- Errors must include a useful message and stable error code, not a generic non-2xx message.
