# Pull Request

## What

<!-- One-line summary of the change. -->

## Why

<!-- Motivation. Link related issue if applicable: Closes #123. -->

## How tested

<!-- Manual steps taken to verify + tests added. -->

- [ ] Unit tests added / updated
- [ ] Ran `npm run lint` + `npx tsc --noEmit` (dnd-app)
- [ ] Ran `pytest` (bmo)
- [ ] Manual smoke test

## Screenshots / demos

<!-- For UI changes. Delete section if N/A. -->

## Migration notes

<!-- Breaking changes? Schema changes? Path changes? systemd changes?
     If none, write "None". -->

## Docs updated

- [ ] `docs/...` if user-facing
- [ ] `dnd-app/docs/...` or `bmo/docs/...` if internal
- [ ] `AGENTS.md` / `.cursorrules` if AI-rule change
- [ ] `docs/KNOWN-ISSUES.md` — resolved entries moved to "Resolved"?
- [ ] `CHANGELOG.md` updated

## Checklist

- [ ] No secrets in diff (`.env`, `*.pem`, `credentials.json`, `token.json`)
- [ ] Tests pass locally
- [ ] Lint clean
- [ ] New files in correct subpackage (`services/`, `hardware/`, `bots/`, etc.)
- [ ] Systemd services restarted on Pi if BMO service files changed
- [ ] Commit messages follow convention (`feat:`, `fix:`, `refactor:`, etc.)

## Related

<!-- Links to related issues, PRs, KNOWN-ISSUES.md entries, or external docs. -->
