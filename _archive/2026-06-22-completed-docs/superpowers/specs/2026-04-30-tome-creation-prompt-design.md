# Tome Creation Prompt Overhaul — Design Spec

**Date:** 2026-04-30
**Status:** Draft (awaiting user review)
**Domain:** dnd-app → dungeon-scholar
**Owner:** Patrick

---

## Problem

The current "Spell of Tome Creation" prompt in `dungeon-scholar/src/App.jsx:3700-3790` produces tomes that don't prepare users effectively for cybersecurity certification exams. Users report six concrete pains:

- **B.** Quiz questions are too easy / pure recall ("What does HTTPS stand for?") instead of scenario-driven exam-style stems.
- **C.** Distractors are obviously wrong — real exam wrong-answers are plausible-sounding misconceptions.
- **D.** Labs are weak / not scenario-driven — exams have Performance-Based Questions (PBQs) but generated labs feel generic.
- **E.** Knowledge base is shallow / disorganized — the Oracle (RAG-based AI tutor) gives weak answers because the KB doesn't structure by exam domain or chunk well for retrieval.
- **F.** Not enough coverage — generates 50 cards but skips half the exam blueprint domains.
- **G.** Wrong tone — the AI gets confused by fantasy framing and produces fantasy-themed quiz content instead of straight technical content.

Root causes:

1. The prompt is **org-agnostic** — it doesn't know whether the user is prepping for CompTIA Security+ (scenario MCs + PBQs) vs CISSP (manager-mindset MCs only) vs OSCP (hands-on offensive). One prompt cannot match all exam philosophies.
2. The prompt has **no exemplars** — "scenario-style MC" gets interpreted very loosely without anchoring examples.
3. The prompt has **no blueprint coverage requirement** — minimums (50/50/5) don't guarantee every objective is touched.
4. The `knowledgeBase` field has **no required structure** — but the Oracle splits chunks on `\n\n+` and `=== ` markers (`App.jsx:3154`), so domain headers materially help RAG retrieval.
5. The prompt's intro is technical, but **fantasy framing leaks** because there's no explicit rule preventing it.

## Goals

1. Replace the single generic prompt with **per-organization prompts** tuned to each org's exam philosophy.
2. Embed **heavy few-shot exemplars** (good + bad samples) per org to anchor question style and distractor quality.
3. Require a **structured `knowledgeBase`** that chunks cleanly for the existing Oracle RAG.
4. Require **blueprint coverage** (≥N items per blueprint domain/objective).
5. Add an **explicit fantasy-leak rule** with anti-pattern exemplars.
6. Let users specify the **exact target exam** via a modal text field that the app injects pre-copy.

## Non-goals

- No app-side parser changes for the new optional `objective` field — additive only; future analytics work is a separate spec.
- No automated quality eval of generated tomes — manual human eval against sample materials is documented in the plan.
- No migration of existing user tomes — old tomes still work because the parser is unchanged.
- No pre-flight linter that validates generated tomes against the new structure — deferred.

## High-level architecture

Three things change in `dungeon-scholar/`:

1. **New module** `src/prompts/` holds 13 files (11 org files + 1 shared module + 1 index). Each org file exports a metadata object and a prompt string.
2. **`PromptModal` extracted from `App.jsx`** to a new file `src/components/PromptModal.jsx` (currently inline at `App.jsx:3698-3848`, ~150 lines). The extracted modal becomes a two-step state machine: Step 1 picks the org, Step 2 displays that org's prompt with a text field for `EXAM TARGET` and a copy button. The app substitutes the user's exam-target value into the prompt before writing to the clipboard. Extraction enables clean colocated testing and prevents `App.jsx` from growing further (already 4784 lines).
3. **JSON schema** gains one optional additive field `objective: string` on every flashcard, quiz item, and lab. The existing parser ignores unknown fields (verified at `App.jsx:1128-1170`), so no app-side parsing changes are required.

## Modal UX (two-step)

Modal title stays `✦ Spell of Tome Creation ✦`. Existing fantasy styling preserved (amber border, dark gradient).

### Step 1 — Org picker

- Subtitle: *"Choose the order whose exams thou wouldst conquer."*
- Vertical list of 11 buttons (alphabetical by org name, Generic last). Each button shows: emoji, org name, one-line subtitle naming common exams.
- Close (X) button in top-right.

### Step 2 — Prompt viewer

- Header: `✦ {Org Name} Tome Spell ✦` with back arrow → Step 1.
- Optional input field: `Exam Target (optional) — e.g. "Security+ SY0-701"`. Fantasy label: *"Name thy chosen trial"*. Max ~250 chars.
- Below the field: prompt body in a `<pre>` block (monospace, scrollable, amber-on-dark — same styling as today's prompt block).
- Bottom: copy button. On click, the app substitutes the user's exam-target value into the prompt's `EXAM TARGET:` line before copying. If the field is empty, the line stays as `EXAM TARGET: <leave blank to let me infer from materials>`.

### State

`PromptModal` adds two pieces of local state: `selectedOrg` (string id or `null`), `examTarget` (string). Going back to Step 1 clears both.

## Module structure

```
dungeon-scholar/src/prompts/
├── index.js          — exports ORG_PROMPTS array
├── _shared.js        — shared header, JSON schema, style rules, footer
├── aws.js
├── cisco.js
├── cmmc.js
├── comptia.js
├── eccouncil.js
├── generic.js
├── giac.js
├── google.js
├── isaca.js
├── isc2.js
└── microsoft.js
```

### Each org file shape

```js
import { SHARED_HEADER, SHARED_SCHEMA, SHARED_STYLE_RULES, SHARED_FOOTER } from './_shared.js';

export const COMPTIA_PROMPT_META = {
  id: 'comptia',
  name: 'CompTIA',
  emoji: '📜',
  subtitle: 'Security+, CySA+, Pentest+, Network+, A+',
  examTargetPlaceholder: 'e.g. Security+ SY0-701',
  commonExams: ['Security+ SY0-701', 'CySA+ CS0-003', 'Pentest+ PT0-003', 'Network+ N10-009', 'A+ Core 1/2'],
};

export const COMPTIA_PROMPT = `${SHARED_HEADER}

ORGANIZATION: CompTIA

EXAM TARGET: <fill in your specific exam, e.g. "Security+ SY0-701" — leave blank to let me infer from materials>

=== ORG-SPECIFIC GUIDANCE ===
[ILLUSTRATIVE — CompTIA-specific blueprint format, style rules, anti-patterns, and ~600 tokens of exemplars are authored inline here during implementation]

${SHARED_SCHEMA}
${SHARED_STYLE_RULES}
${SHARED_FOOTER}`;
```

### `_shared.js` contents

- `SHARED_HEADER` — opening line, app description, what materials user will provide, technical-only intro (no fantasy framing).
- `SHARED_SCHEMA` — full JSON schema with every field documented, including the new optional `objective: string` field. Required `=== Domain N: <Name> ===` KB markers spelled out here.
- `SHARED_STYLE_RULES` — fantasy-leak rule, technical-content-only rule, exemption for `explanation` and `hint`.
- `SHARED_FOOTER` — output format (file save preferred, code block fallback), single-message rule.

### `index.js`

```js
import { COMPTIA_PROMPT, COMPTIA_PROMPT_META } from './comptia.js';
// ... 10 more imports ...

export const ORG_PROMPTS = [
  { ...AWS_PROMPT_META, prompt: AWS_PROMPT },
  { ...CISCO_PROMPT_META, prompt: CISCO_PROMPT },
  { ...CMMC_PROMPT_META, prompt: CMMC_PROMPT },
  { ...COMPTIA_PROMPT_META, prompt: COMPTIA_PROMPT },
  { ...ECCOUNCIL_PROMPT_META, prompt: ECCOUNCIL_PROMPT },
  { ...GIAC_PROMPT_META, prompt: GIAC_PROMPT },
  { ...GOOGLE_PROMPT_META, prompt: GOOGLE_PROMPT },
  { ...ISACA_PROMPT_META, prompt: ISACA_PROMPT },
  { ...ISC2_PROMPT_META, prompt: ISC2_PROMPT },
  { ...MICROSOFT_PROMPT_META, prompt: MICROSOFT_PROMPT },
  { ...GENERIC_PROMPT_META, prompt: GENERIC_PROMPT },
];
```

## Per-org prompt anatomy

Every org's prompt body follows the same section order so users can mentally diff them. Approximate length per prompt: 2200-3000 tokens. Total prompt content across 11 prompts: ~30k tokens / ~25-30k characters.

1. **Intro (shared)** — Plain technical, zero fantasy. Comes from `SHARED_HEADER`.
2. **Organization + EXAM TARGET line (org-specific)** — The `EXAM TARGET:` line that the modal substitutes pre-copy.
3. **About this organization (org-specific, ~150 tokens)** — Exam philosophy and what makes the style distinctive.
4. **Common exams under this org (org-specific, ~100 tokens)** — Bullet list of active exam codes so the AI knows what's in scope.
5. **Blueprint structure (org-specific, ~150 tokens)** — Canonical domain layout; AI uses to structure `knowledgeBase` and assign `objective` values.
6. **Item volume + blueprint coverage rules (org-specific, ~100 tokens)** — Per-org minimums plus the universal "≥5 per blueprint objective, scale with material" layer.
7. **Style guidance + question patterns (org-specific, ~250 tokens)** — Quiz stem rules, qualifier wording, distractor patterns, common artifacts.
8. **Heavy exemplars (org-specific, ~600 tokens)** — Per pain B+C+D:
   - One **good** flashcard
   - One **good** + one **bad** quiz MC (bad annotated `❌ DO NOT GENERATE LIKE THIS`)
   - One **good** lab/PBQ with realistic artifacts
   - One **fantasy-leak** anti-pattern annotated `❌ NEVER`
9. **JSON schema (shared)** — Full schema with the new optional `objective` field. KB structure requirement.
10. **Style rules (shared)** — Fantasy-leak rule, technical-content-only rule, permitted mild fantasy in `explanation` and `hint` only.
11. **Output format + footer (shared)** — File save preferred, code block fallback, single-message rule.

## Concrete org list & exam catalog

Picker order: alphabetical by name, Generic last.

| # | id | emoji | Name | Subtitle (button) | Common exams (embedded in prompt) | Distinctive style cue |
|---|---|---|---|---|---|---|
| 1 | `aws` | ☁️ | AWS | Cloud Practitioner, SAA, Security Specialty, SCS, SysOps, Devs | CLF-C02, SAA-C03, SCS-C02, SAP-C02, DOP-C02, SOA-C02, DVA-C02, DEA-C01, MLA-C01, ANS-C01 | Scenario-architect ("a customer needs..."), service-knowledge-heavy, Well-Architected pillars, IAM/KMS/VPC specifics |
| 2 | `cisco` | ⚔️ | Cisco | CCNA, CCNP Security, CCIE, CyberOps Assoc/Pro | CCNA 200-301, CCNP Security SCOR 350-701, CCIE Security, CyberOps Associate 200-201, CyberOps Professional 350-201/300-215, DevNet Associate | IOS config snippets, CLI commands, packet captures, simulation-style questions |
| 3 | `cmmc` | 🛡️ | CMMC | Levels 1-3, NIST 800-171/172 mapping | CMMC Level 1, Level 2, Level 3; CCP, CCA | Control-assessment framing ("does this evidence satisfy practice X.Y at Level Z"), framework-mapping, evidence-driven |
| 4 | `comptia` | 📜 | CompTIA | Security+, CySA+, Pentest+, Network+, A+ | Security+ SY0-701, CySA+ CS0-003, Pentest+ PT0-003, Network+ N10-009, A+ Core 1/2 (220-1101/1102), Linux+ XK0-005, Server+ SK0-005, Cloud+ CV0-004 | Scenario stems, "BEST/MOST/FIRST" qualifiers, PBQs simulating drag-drop / log analysis / firewall config |
| 5 | `eccouncil` | 🗡️ | EC-Council | CEH, CHFI, CND, CCISO | CEH v13, CHFI v11, CND, CCISO, CSCU, CTIA, ECSA | Tool/methodology focus (Metasploit, nmap, recon-ng, Burp), kill-chain phases, attacker mindset |
| 6 | `giac` | ⚜️ | GIAC | GSEC, GCIH, GPEN, GCFA, GREM | GSEC, GCIH, GPEN, GCFA, GCFE, GREM, GWAPT, GMON, GCIA, GMOB, GCED, GICSP, GCCC | Deep technical, command-line output, tool-driven (Wireshark, Volatility, nmap, Snort, Sysmon), "what does this output show" |
| 7 | `google` | 🌈 | Google | Cloud Security Eng, Cloud Architect, Workspace Admin | Professional Cloud Security Engineer, Professional Cloud Architect, Cloud Digital Leader, Professional Cloud Network Engineer, Workspace Administrator, Workspace Developer | GCP service-specific (IAM, VPC SC, BeyondCorp, Cloud KMS), scenario-based |
| 8 | `isaca` | 🏺 | ISACA | CISA, CISM, CRISC, CGEIT, CDPSE | CISA, CISM, CRISC, CGEIT, CDPSE | Governance, audit findings, risk assessment, business-impact framing, "BEST/PRIMARY" qualifier wording |
| 9 | `isc2` | 🏛️ | (ISC)² | CISSP, CCSP, SSCP, CSSLP | CISSP, CCSP, SSCP, CSSLP, HCISPP, CGRC | Manager-mindset, "MOST" answers, governance/risk-heavy vignettes, **no PBQs in real exam** — quiz-heavy in tome |
| 10 | `microsoft` | 🔷 | Microsoft | SC-100/200/300/400, AZ-500, MS-500 | SC-100, SC-200, SC-300, SC-400, AZ-500, MS-102, MD-102, AZ-104, AZ-305, AZ-700 | Role-based, KQL queries (SC-200), Conditional Access policies (SC-300), Azure/M365/Intune/Defender ecosystem |
| 11 | `generic` | 📖 | Generic | Any cybersecurity exam or framework | (none — user fills in `EXAM TARGET`) | Falls back to org-agnostic exam-style guidance: scenario stems, plausible distractors, blueprint coverage if user names one |

## Cross-cutting prompt content rules

### JSON schema additions (additive, no app parser changes)

- New optional field `objective: string` on every flashcard, quiz item, and lab. Format: org-blueprint reference. Examples:
  - CompTIA: `"1.4"`
  - CISSP: `"Domain 3 — Security Architecture"`
  - AWS: `"IAM"`
  - CMMC: `"AC.L2-3.1.1"`
- All other existing fields unchanged. The current `App.jsx` parser ignores unknown fields.

### Required `knowledgeBase` format (fixes pain E)

```
=== Domain 1: <Name from blueprint> ===

Domain 1: <concept>. <≥4 sentences with key terms, real artifacts/commands, exam-style framing>

Domain 1: <concept>. <≥4 sentences ...>

Domain 1: <concept>. <≥4 sentences ...>

=== Domain 2: <Name> ===

Domain 2: <concept>. ...
```

- ≥3 paragraphs per domain
- Each paragraph self-identifies its domain in its first 4 words
- Each paragraph ≥4 sentences
- Total KB ≥3000 words for typical exam scope, scaling up with material volume
- The Oracle splits on `\n\n+` and `=== ` (per `App.jsx:3154`); this format chunks cleanly so each retrieved chunk carries its domain context.

### Style rules (fixes pain G)

- Technical content **only** in: `front`, `back`, `term`, `definition`, `question`, `options[]`, `acceptedAnswers[]`, `scenario`, `prompt` (lab steps), `title` (lab), and all KB paragraphs.
- Mild fantasy flavor **permitted** in: `explanation` and `hint` only. Light flourishes ("Brave scholar, the answer hinges on...") are OK; technical accuracy of the explanation must still hold.
- Each prompt includes one **fantasy-leak anti-pattern exemplar** showing what NOT to do.

### Volume + blueprint coverage rules (fixes pain F)

Per-org baselines (final values tuned during authoring; rough cuts shown here):

| Org | Flashcards | Quiz | Labs |
|---|---|---|---|
| CompTIA | ≥80 | ≥80 | ≥10 (PBQ-heavy) |
| Cisco | ≥80 | ≥80 | ≥8 (CLI-scenario heavy) |
| ISC² | ≥80 | ≥120 | ≥4 (no real-exam PBQs; quiz-heavy) |
| GIAC | ≥80 | ≥120 | ≥10 (open-book technical) |
| ISACA | ≥80 | ≥100 | ≥6 (governance vignettes) |
| EC-Council | ≥80 | ≥80 | ≥10 (tools/methodology) |
| CMMC | ≥60 | ≥80 | ≥8 (control assessment) |
| AWS | ≥80 | ≥80 | ≥10 (service scenarios) |
| Microsoft | ≥80 | ≥80 | ≥10 (role-based scenarios) |
| Google | ≥80 | ≥80 | ≥8 (GCP service scenarios) |
| Generic | ≥80 | ≥80 | ≥8 (default to CompTIA shape) |

Plus the universal layer applied to every prompt: **≥5 flashcards, ≥5 quiz items, ≥1 lab per blueprint domain/objective**, scaling proportionally if material exceeds the baseline.

### Question style rules (fixes pains B + C)

- Quiz stems ≥2 sentences, scenario-driven (set the context: who, what, where).
- Multiple-choice items must use a "BEST", "MOST", "FIRST", "PRIMARY", "NEXT", or equivalent qualifier.
- Distractors must be plausible misconceptions — never throwaway answers. Each prompt's good/bad exemplars demonstrate this concretely.
- Bloom's mix: ~30% recall (Remember/Understand), ~50% applied scenario (Apply), ~20% analysis (Analyze/Evaluate). Required mix is stated in each prompt.

### Lab/PBQ style rules (fixes pain D)

- Each lab's `scenario` ≥3 sentences and references a realistic situation (incident, audit, deployment, alert).
- ≥4 stages per lab, mixing MC steps and free-response steps.
- Per-org artifact requirements:
  - **Cisco**: ≥1 IOS config or `show` output snippet
  - **AWS**: ≥1 IAM policy / service config decision
  - **CompTIA**: ≥1 log line, command output, or firewall-rule decision
  - **GIAC**: ≥1 tool output (Wireshark, Volatility, Sysmon, etc.)
  - **Microsoft**: ≥1 KQL query, Conditional Access policy, or Defender alert
  - **ISC²**: governance vignette with stakeholder dynamics
  - **CMMC**: control assessment evidence decision
  - **ISACA**: audit finding → recommendation flow
  - **EC-Council**: tool/command-line decision in attacker-methodology context
  - **Google**: GCP service config (IAM, VPC SC, KMS) decision
  - **Generic**: at least one realistic artifact (log/config/output/policy)

## Integration with `App.jsx`

`PromptModal` (currently `App.jsx:3698-3848`, ~150 lines) is extracted to its own file `dungeon-scholar/src/components/PromptModal.jsx`. The integration consists of:

1. **Create the new components directory** if it doesn't exist: `dungeon-scholar/src/components/`. (No existing `components/` directory today; this is the first one.)

2. **Create `src/components/PromptModal.jsx`** with the new two-step modal:
   ```js
   import { useState, useMemo } from 'react';
   import { Wand2, X, Check, ArrowLeft } from 'lucide-react';
   import { ORG_PROMPTS } from '../prompts/index.js';
   ```

3. **New `PromptModal` shape:**
   ```jsx
   export default function PromptModal({ onClose }) {
     const [selectedOrg, setSelectedOrg] = useState(null);
     const [examTarget, setExamTarget] = useState('');
     const [copied, setCopied] = useState(false);

     const org = selectedOrg ? ORG_PROMPTS.find(o => o.id === selectedOrg) : null;

     const finalPrompt = useMemo(() => {
       if (!org) return '';
       const target = examTarget.trim() || '<leave blank to let me infer from materials>';
       return org.prompt.replace(
         /EXAM TARGET: <[^>]+>/,
         `EXAM TARGET: ${target}`
       );
     }, [org, examTarget]);

     const copy = () => { /* same try/textarea/clipboard logic, using finalPrompt */ };

     if (!selectedOrg) return <OrgPicker orgs={ORG_PROMPTS} onPick={setSelectedOrg} onClose={onClose} />;
     return <PromptViewer org={org} examTarget={examTarget} setExamTarget={setExamTarget} finalPrompt={finalPrompt} copied={copied} onCopy={copy} onBack={() => { setSelectedOrg(null); setExamTarget(''); }} onClose={onClose} />;
   }
   ```

4. **Two new local sub-components** in `PromptModal.jsx`:
   - `OrgPicker` — Step 1 vertical list. Reuses the modal shell (header, X button, amber styling).
   - `PromptViewer` — Step 2 view with back arrow, exam-target input, prompt `<pre>`, copy button. Reuses the modal shell.

5. **Update `App.jsx`** — replace the inline `function PromptModal(...)` definition (`App.jsx:3698-3848`) with an import:
   ```js
   import PromptModal from './components/PromptModal.jsx';
   ```
   `App.jsx:1529` already conditionally renders `<PromptModal />`. Same for the tutorial trigger at `App.jsx:1548`. No other call-site changes.

6. **Net effect on `App.jsx`:** -150 lines (the inline PromptModal definition removed); +1 line (the import). Other new files: 11 org prompt files + `_shared.js` + `index.js` in `src/prompts/` (~25-30k chars total), and `src/components/PromptModal.jsx` (~200 lines).

## Testing strategy

Vitest is wired up (commits `89b1280`, `96a73ca`).

### Module shape tests — `src/prompts/index.test.js`

- `ORG_PROMPTS` has exactly 11 entries.
- Every entry has `{ id, name, emoji, subtitle, examTargetPlaceholder, commonExams, prompt }`.
- All `id`s are unique.
- Every prompt string contains the literal `EXAM TARGET:` line (so the modal substitution always works).
- Every prompt contains the shared schema marker (the schema section header).
- Every prompt mentions `=== Domain` (KB structure requirement).
- Every prompt mentions the fantasy-leak rule.

### Modal unit tests — `src/components/PromptModal.test.jsx`

- Step 1 renders 11 buttons; clicking one transitions to Step 2.
- Step 2 back arrow returns to Step 1 and clears the exam-target input.
- Exam-target input is reflected in the rendered prompt preview.
- Copy button calls `document.execCommand('copy')` (or clipboard fallback) — assert via mock.
- When exam-target is blank, the copied text contains the default `<leave blank...>` placeholder.
- When exam-target is filled, the copied text contains the user's value substituted into the `EXAM TARGET:` line.

### Manual eval

Real quality check is human: run each org's prompt against Claude/ChatGPT/Gemini with a sample piece of cybersec material (a Sec+ chapter, a CISSP study guide section, an AWS Security Specialty whitepaper). Verify:

- Quiz items use scenario stems with "BEST/MOST/FIRST" wording.
- Distractors are plausible misconceptions, not obviously wrong.
- Lab scenarios feel like real exam PBQs with realistic artifacts.
- Knowledge base chunks well in the Oracle (test: ask the Oracle a domain-specific question and verify it cites the right chunk).
- No fantasy leak in technical content fields.

This manual eval is documented as a checklist in the implementation plan, not as automated tests. Automated quality eval is out of scope.

## Out of scope (deferred to future specs)

- **Per-domain analytics** in the app (would consume the new `objective` field). Schema is in place; UI is a separate spec.
- **Pre-flight linter** that validates a generated tome against the new schema rules before importing.
- **Migration of existing user tomes** — not needed; old tomes still work because the parser is unchanged.
- **Automated quality eval** of generated tomes (e.g., LLM-as-judge evaluating tome quality against rubric). Manual eval suffices for now.
- **Tutorial integration** — the existing `forge_tome` tutorial step (`App.jsx:362-369`) still triggers the modal correctly with no changes. Tutorial copy may want a refresh in a future cycle to mention the org picker, but that's separate.

## Open questions / follow-ups

- **Tutorial copy** at `App.jsx:362-369, 371-378` references "the Spell of Tome Creation" generically. Once the modal becomes a two-step picker, those tutorial step descriptions still read fine — but the second step ("Inscribe Thy First Tome") could optionally mention "pick your exam's organization first." Not blocking; flag for a future tutorial-copy pass.
- **Generic prompt fallback heuristic.** When `EXAM TARGET` is blank in the Generic prompt, the AI should default to CompTIA-Security+-shaped content (scenario MCs, PBQs, blueprint domains) since that's the most common cybersec entry-level exam. Verify this default during authoring of the generic prompt.
- **Per-org-prompt token budgets.** Targets are 2200-3000 tokens. If any prompt drifts past 3500 tokens during authoring, trim exemplars or move bulk content to `_shared.js`.

## Acceptance criteria

A user can:

1. Open the Spell of Tome Creation modal and see 11 org buttons (alphabetical, Generic last).
2. Click "CompTIA" → see Step 2 with the CompTIA prompt + an exam-target text field.
3. Type "Security+ SY0-701" in the field → see the prompt's `EXAM TARGET:` line update in the preview.
4. Click copy → paste into Claude/ChatGPT/Gemini → the AI generates a tome that:
   - Has scenario-style quiz items with "BEST/MOST/FIRST" wording
   - Has plausible distractors (not throwaway wrong answers)
   - Has multi-stage lab/PBQ scenarios with realistic artifacts
   - Has a `knowledgeBase` with `=== Domain N: <Name> ===` markers and ≥3 paragraphs per domain
   - Hits the per-domain coverage minimum (≥5 items per blueprint objective)
   - Contains no fantasy framing in technical content fields
   - Allows mild fantasy flavor in `explanation` and `hint` fields
5. Repeat (2-4) for any of the 11 orgs and get tone-appropriate output.
6. Existing imported tomes (without the new schema fields) continue to work unchanged.
