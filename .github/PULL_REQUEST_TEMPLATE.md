## What changed and why

## Checks
- [ ] CI is green (types, lint, tests, build)
- [ ] No secrets, passwords or personal data in the diff
- [ ] Database changes come with a migration, and new tables have grants for the right role
- [ ] New admin routes are covered in `server/tests/integration/authorization.test.ts`
- [ ] Anything shown from the API is rendered as text (no raw HTML)
- [ ] Docs updated if behaviour or setup changed
