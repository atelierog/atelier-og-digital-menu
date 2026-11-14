# Digital Vision — Git and Release Policy

## Branch roles

| Branch pattern | Purpose | Deployment |
|---|---|---|
| `main` | Future canonical production source after the recovery branch is reconciled and deliberately merged | Production only after release gates are established |
| `release/digital-vision-unified` | Current integration/recovery branch and source baseline for migration | Vercel Preview |
| `architecture/*` | Architecture baseline and cross-cutting foundation work | Vercel Preview when Vercel quota permits |
| `feature/*`, `fix/*` | Short-lived, focused implementation branches | Vercel Preview |

Do not commit new migration work directly to `main` while it remains behind the active release branch. Do not assume a branch is production simply because its name contains `release`.

## Commit policy

- Commit every coherent, reviewable unit of work.
- Use conventional commit subjects: `feat(scope): ...`, `fix(scope): ...`, `refactor(scope): ...`, `test(scope): ...`, `docs(scope): ...`, `chore(scope): ...`.
- A commit must include the code, tests and documentation needed to understand that unit.
- Do not combine unrelated UI, schema and deployment changes in one commit.
- Never commit secrets, environment files, browser state, generated credentials or customer data.
- Never rewrite shared branch history or force-push unless explicitly approved and coordinated.

## Pull request policy

Every migration branch opens a PR into `release/digital-vision-unified` until the release branch has been accepted and merged to `main). A PR must state:
- problem and scope;
- architecture layer and modules changed;
- database/Edge Function impact;
- tests executed and their limits;
- exact preview URL and commit SHA, when available;
- rollback/recovery plan.

## Required checks

1. Dependency installation from a committed lockfile.
2. Production Vite build.
3. Unit and regression tests.
4. Playwright browser tests.
5. Tenant isolation and role/entitlement checks for affected domains.
6. Preview deployment from the same commit SHA.
7. Live role-by-role acceptance before production promotion.

A READY Vercel deployment is not a substitute for application acceptance. If Vercel's deployment quota blocks a preview, CI must still run and the preview gate remains explicitly pending.

## Production safety

- No migration PR deploys to production.
- No schema reset or destructive migration during application restructuring.
- Database migrations are additive/compatible where possible and reviewed separately.
- Promote only the exact accepted SHA.
- Keep the prior production deployment available for rollback.
- Record the production deployment ID, Git SHA and release date.
