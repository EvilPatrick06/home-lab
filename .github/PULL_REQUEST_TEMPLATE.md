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
- [ ] If resolving a logged issue — entry moved from active log (`docs/BMO-ISSUES-LOG.md` / `ISSUES-LOG-DNDAPP.md` / `BMO-SUGGESTIONS-LOG.md` / `SUGGESTIONS-LOG-DNDAPP.md`) to the matching domain resolved file (`docs/BMO-RESOLVED-ISSUES.md` or `docs/RESOLVED-ISSUES-DNDAPP.md`) with commit SHA
- [ ] `docs/CHANGELOG.md` updated

## Checklist

- [ ] No secrets in diff (`.env`, `*.pem`, `credentials.json`, `token.json`)
- [ ] Tests pass locally
- [ ] Lint clean
- [ ] New files in correct subpackage (`services/`, `hardware/`, `bots/`, etc.)
- [ ] Systemd services restarted on Pi if BMO service files changed
- [ ] Commit messages follow convention (`feat:`, `fix:`, `refactor:`, etc.)

## Related

<!-- Links to related issues, PRs, active-log entries (`BMO-ISSUES-LOG.md` / `ISSUES-LOG-DNDAPP.md` / `BMO-SUGGESTIONS-LOG.md` / `SUGGESTIONS-LOG-DNDAPP.md`), or external docs. -->
