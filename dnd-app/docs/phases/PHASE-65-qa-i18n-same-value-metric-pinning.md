# PHASE-65 — Pin the QA i18n same-value metric (method-sensitive counter breaks run-to-run comparability)

> Authored from the 2026-07-02 WEB-build QA report (Dungeon Table Online, v2.7.2). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md. PLANNING ONLY — this phase authors the plan; no app code changes here.

## Goal

Make the unattended QA runs' Spanish same-value counter **comparable across runs**. The v2.7.2 pass proved the current metric is an artifact of counting method, not of the data: `en.json`/`es.json` were **byte-identical** between v2.7.1 and v2.7.2 (`git diff 248d37b1..e1972fe0 -- …/i18n/` empty; keyed parity 6,541/6,541), yet the v2.7.2 run counted **228** es values identical to English where the v2.7.1 run counted **168** on the same files — and the v2.7.1 report had itself flagged a "163 → 168 creep" as possible drift. Two consecutive reports drew drift conclusions from a number that moves ±35% with the counting script. Until the metric is pinned (exact script, recorded in the QA instructions), every future run's creep/drift claim is noise.

This is a **process/docs** phase (severity: info): it changes the QA methodology docs and adds one small repo script; no app code, no locale-file edits (the actual es-terminology items remain owned by PHASE-62/PHASE-57).

## Dependencies & cross-phase notes

- **No prerequisites; freely reorderable.** Touches `dnd-app/docs/phases/QA/INSTRUCTIONS.md` + one new script under `dnd-app/scripts/` (already a knip entry glob — no dead-code config churn).
- **PHASE-62 (done) context:** the v2.7.1 run recorded the 163→168 observation as a PHASE-62 carry-forward; 62 has since completed. This phase supersedes that carry-forward's open question — the "creep" is now understood as method sensitivity, and the deliberate-vs-leak audit of individual same-value keys stays with the QA runs themselves once the metric is stable.
- **Autonomy policy:** non-bug (`process`/`docs`) — gated on the status board for approval per INSTRUCTIONS.md; author + park until approved.

## Verified findings

### QA-I18N-METRIC-1 (info, process) — same-value counter is method-sensitive; consecutive reports disagree on identical inputs

**Status: confirmed from the two reports + the locale files.** The likely divergence sources (all must be pinned): whether non-string leaves (numbers/booleans) count; whether values are normalized (`.strip()`, case) before comparison; whether interpolation-only or punctuation-only values count; whether intentionally-identical classes (proper nouns — "Dungeon Master" pre-62, dice notation like "1d20", unit strings, brand names) are excluded or inflate the count.

**Expected:** one recorded script, one recorded invocation, one baseline number; successive unattended runs cite deltas against that baseline only.

## Sub-phases

### 65A — Add the pinned same-value scanner script

**Objective:** a deterministic, versioned counter any QA run can invoke.

**Files:** new `dnd-app/scripts/i18n-same-value-report.mjs`.

**Steps:**

1. Implement per the report's suggested pin: flatten both locale files; compare **string-type leaves only**, after `.trim()`; skip keys matching an explicit allowlist (top of the script, commented) of intentional same-value classes — proper nouns/brand names, dice/rules notation (`/^\d*d\d+/` etc.), pure-interpolation values (`/^{{.*}}$/`), punctuation/symbol-only values. Output: total compared, allowlisted count, same-value count, and the sorted key list (so runs can diff *which* keys, not just how many).
2. Keep it dependency-free (plain `node`, JSON import) so the unattended QA agent can run it from a bare checkout.

**Acceptance:** two consecutive invocations on the same tree emit identical output; running it at v2.7.1's `248d37b1` and v2.7.2's `e1972fe0` emits the **same** number (the files are identical — this is the regression test for the metric itself). Record that number as the baseline in 65B.

### 65B — Record the method + baseline in the QA instructions

**Objective:** future unattended runs use the pinned metric and cite comparable numbers.

**Files:** `dnd-app/docs/phases/QA/INSTRUCTIONS.md`.

**Steps:**

1. Add an "i18n same-value metric" subsection: the exact invocation (`node scripts/i18n-same-value-report.mjs`), the baseline number + the commit it was measured at, and the rule that reports cite the script's number only (ad-hoc flatten-and-compare counts are explicitly deprecated); allowlist changes require a one-line rationale in the QA report that makes them.

**Acceptance:** INSTRUCTIONS.md documents script, invocation, baseline, and the deprecation of ad-hoc counts; next QA report's i18n section is expressible entirely against the baseline.
