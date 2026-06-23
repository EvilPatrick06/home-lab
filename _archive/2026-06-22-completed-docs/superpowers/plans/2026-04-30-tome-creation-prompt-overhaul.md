# Tome Creation Prompt Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single fantasy-themed tome-creation prompt in Dungeon Scholar with 11 per-organization prompts (CompTIA, Cisco, ISC², GIAC, ISACA, EC-Council, CMMC, AWS, Microsoft, Google + Generic), behind a two-step modal that injects an optional `EXAM TARGET` value before copying.

**Architecture:** New `src/prompts/` module holds 13 files (1 shared + 11 org + 1 index). `PromptModal` extracts from `App.jsx` to `src/components/PromptModal.jsx` and becomes a state machine: Step 1 = org picker, Step 2 = prompt viewer with text input that substitutes into the prompt's `EXAM TARGET:` line at copy time. JSON schema gains an additive optional `objective` field per item — no app parser changes required.

**Tech Stack:** React 18, Vite, Vitest, @testing-library/react, lucide-react, tailwindcss. Test setup at `dungeon-scholar/src/test-setup.js` already loads `@testing-library/jest-dom/vitest`.

**Spec:** `docs/superpowers/specs/2026-04-30-tome-creation-prompt-design.md` (commit `73084fb`)

---

## File Structure

**New files (in `dungeon-scholar/`):**
- `src/prompts/_shared.js` — `SHARED_HEADER`, `SHARED_SCHEMA`, `SHARED_STYLE_RULES`, `SHARED_FOOTER` exports
- `src/prompts/_shared.test.js` — tests for shared sections
- `src/prompts/index.js` — `ORG_PROMPTS` array
- `src/prompts/index.test.js` — module shape tests + per-org registration tests
- `src/prompts/comptia.js` — `COMPTIA_PROMPT_META` + `COMPTIA_PROMPT`
- `src/prompts/aws.js` — `AWS_PROMPT_META` + `AWS_PROMPT`
- `src/prompts/cisco.js` — `CISCO_PROMPT_META` + `CISCO_PROMPT`
- `src/prompts/cmmc.js` — `CMMC_PROMPT_META` + `CMMC_PROMPT`
- `src/prompts/eccouncil.js` — `ECCOUNCIL_PROMPT_META` + `ECCOUNCIL_PROMPT`
- `src/prompts/giac.js` — `GIAC_PROMPT_META` + `GIAC_PROMPT`
- `src/prompts/google.js` — `GOOGLE_PROMPT_META` + `GOOGLE_PROMPT`
- `src/prompts/isaca.js` — `ISACA_PROMPT_META` + `ISACA_PROMPT`
- `src/prompts/isc2.js` — `ISC2_PROMPT_META` + `ISC2_PROMPT`
- `src/prompts/microsoft.js` — `MICROSOFT_PROMPT_META` + `MICROSOFT_PROMPT`
- `src/prompts/generic.js` — `GENERIC_PROMPT_META` + `GENERIC_PROMPT`
- `src/components/PromptModal.jsx` — extracted modal (was `App.jsx:3698-3848`)
- `src/components/PromptModal.test.jsx` — modal flow tests

**Modified files:**
- `src/App.jsx` — remove inline `PromptModal` definition, add import

**Conventions** (already established in this codebase):
- Test files colocate next to source: `.test.jsx` for components, `.test.js` for plain JS
- ES modules, `"type": "module"`
- Vitest: `npm test` (single run), `npm run test:watch` (watch mode)
- Single-quoted strings, no semicolons (verify against existing files; current code uses semicolons — match existing style)

---

## Task 1: Create `_shared.js` with shared header/schema/rules/footer

**Files:**
- Create: `dungeon-scholar/src/prompts/_shared.js`
- Create: `dungeon-scholar/src/prompts/_shared.test.js`

- [ ] **Step 1: Write the failing test**

Create `dungeon-scholar/src/prompts/_shared.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  SHARED_HEADER,
  SHARED_SCHEMA,
  SHARED_STYLE_RULES,
  SHARED_FOOTER,
} from './_shared.js';

describe('shared prompt sections', () => {
  it('SHARED_HEADER is a non-empty string and contains app name', () => {
    expect(typeof SHARED_HEADER).toBe('string');
    expect(SHARED_HEADER.length).toBeGreaterThan(100);
    expect(SHARED_HEADER).toMatch(/Dungeon Scholar/);
  });

  it('SHARED_SCHEMA documents every required field', () => {
    expect(SHARED_SCHEMA).toMatch(/metadata/);
    expect(SHARED_SCHEMA).toMatch(/knowledgeBase/);
    expect(SHARED_SCHEMA).toMatch(/flashcards/);
    expect(SHARED_SCHEMA).toMatch(/quiz/);
    expect(SHARED_SCHEMA).toMatch(/labs/);
    expect(SHARED_SCHEMA).toMatch(/objective/);
    expect(SHARED_SCHEMA).toMatch(/=== Domain/);
  });

  it('SHARED_STYLE_RULES forbids fantasy in technical fields and permits it in explanation/hint', () => {
    expect(SHARED_STYLE_RULES).toMatch(/explanation/);
    expect(SHARED_STYLE_RULES).toMatch(/hint/);
    expect(SHARED_STYLE_RULES).toMatch(/technical/i);
    expect(SHARED_STYLE_RULES).toMatch(/fantasy/i);
  });

  it('SHARED_FOOTER mentions output format', () => {
    expect(SHARED_FOOTER).toMatch(/JSON/);
    expect(SHARED_FOOTER).toMatch(/code block|file/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dungeon-scholar && npm test -- prompts/_shared.test.js`
Expected: FAIL with module-not-found error for `./_shared.js`

- [ ] **Step 3: Create `_shared.js` with full content**

Create `dungeon-scholar/src/prompts/_shared.js`:

```js
export const SHARED_HEADER = `You are creating a tome file for Dungeon Scholar, a study app that converts study materials into structured exam-prep content. I will provide study materials (notes, PDFs, slides, video transcripts, lecture recordings, textbook chapters). Generate a single JSON object matching the schema below.

The user is preparing for a real-world certification exam. Your output must reflect the question style, blueprint coverage, and pedagogical depth of that exam — not generic study trivia.`;

export const SHARED_SCHEMA = `=== JSON SCHEMA ===

{
  "metadata": {
    "title": "Course or exam name (required)",
    "description": "Brief summary (required)",
    "subject": "Cybersecurity (recommended)",
    "author": "Optional source author or course creator",
    "difficulty": 3,
    "tags": ["cert-prep", "<exam-code>", "<topic-tags>"],
    "version": "1.0"
  },
  "knowledgeBase": "Structured reference text — see KB FORMAT below",
  "flashcards": [
    {
      "id": "fc1",
      "front": "Term, concept, or question (technical, no fantasy)",
      "back": "Definition or answer (technical, no fantasy)",
      "hint": "Optional — mild fantasy flavor permitted",
      "objective": "Optional blueprint reference, e.g. '1.4' or 'Domain 3'"
    }
  ],
  "quiz": [
    {
      "id": "q1",
      "type": "multiplechoice",
      "question": "Scenario stem ≥2 sentences, ending in BEST/MOST/FIRST/PRIMARY/NEXT qualifier (technical, no fantasy)",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "Why correct + why distractors are wrong (mild fantasy flavor permitted)",
      "hint": "Optional — mild fantasy flavor permitted",
      "objective": "Optional blueprint reference"
    },
    {
      "id": "q2",
      "type": "truefalse",
      "question": "Technical statement to evaluate",
      "correctAnswer": true,
      "explanation": "Why",
      "hint": "Optional",
      "objective": "Optional"
    },
    {
      "id": "q3",
      "type": "fillblank",
      "question": "The ___ protocol encrypts web traffic.",
      "acceptedAnswers": ["HTTPS", "https", "TLS"],
      "explanation": "Why",
      "hint": "Optional",
      "objective": "Optional"
    }
  ],
  "labs": [
    {
      "id": "lab1",
      "title": "Realistic scenario title (technical)",
      "scenario": "≥3 sentences setting up an incident, audit, deployment, or alert (technical)",
      "objective": "Optional blueprint reference",
      "steps": [
        {
          "prompt": "Step instruction or analysis question (technical)",
          "options": ["A", "B", "C"],
          "correctIndex": 1,
          "explanation": "Why (mild fantasy flavor permitted)"
        },
        {
          "prompt": "Free-response step asking for a specific command, value, or short text answer",
          "acceptedAnswers": ["answer1", "answer 1"],
          "explanation": "Why"
        }
      ]
    }
  ]
}

=== KNOWLEDGE BASE FORMAT (CRITICAL — READ CAREFULLY) ===

The \`knowledgeBase\` field is consumed by an in-app AI tutor (the Oracle) that splits it into chunks on \`\\n\\n+\` and \`=== \` markers. Each chunk becomes a retrievable RAG source. To make retrieval work, format it like this:

=== Domain 1: <Name from blueprint> ===

Domain 1: <concept name>. <≥4 sentences explaining the concept, including key terms, real artifacts/commands, and exam-style framing>

Domain 1: <next concept>. <≥4 sentences ...>

Domain 1: <next concept>. <≥4 sentences ...>

=== Domain 2: <Name from blueprint> ===

Domain 2: <concept>. <≥4 sentences ...>

Requirements:
- Use \`=== Domain N: <Name> ===\` headers between every blueprint domain
- Each paragraph must START with \`Domain N: <concept>.\` so retrieved chunks carry context
- ≥3 paragraphs per domain
- Each paragraph ≥4 sentences with real technical detail
- Total knowledge base ≥3000 words for typical exam scope; scale up if material is large

=== ITEM ID REQUIREMENTS ===

- Every flashcard, quiz item, and lab must have a unique \`id\` (e.g. \`fc1\`, \`fc2\`, \`q1\`, \`q2\`, \`lab1\`)
- IDs must be stable strings (no spaces, no special characters)
- The optional \`objective\` field on each item should reference your blueprint (e.g. CompTIA "1.4", CISSP "Domain 3", AWS "IAM", CMMC "AC.L2-3.1.1")`;

export const SHARED_STYLE_RULES = `=== STYLE RULES (CRITICAL) ===

The Dungeon Scholar app surrounds your output with fantasy-themed UI ("scrolls", "riddles", "trials", "Tome of Failures"), but the technical content you generate inside the JSON MUST stay exam-realistic.

TECHNICAL CONTENT ONLY (no fantasy framing, no archaic English, no D&D references):
- flashcard \`front\`, \`back\`, \`term\`, \`definition\`
- quiz \`question\`, \`options[]\`, \`acceptedAnswers[]\`
- lab \`title\`, \`scenario\`, step \`prompt\`
- every paragraph in \`knowledgeBase\`

MILD FANTASY FLAVOR PERMITTED (light flourishes only — technical accuracy must still hold):
- \`explanation\` field on every quiz item, lab step
- \`hint\` field on flashcards and quiz items

Examples:
- ✅ explanation: "Brave scholar, the answer hinges on the principle of least privilege — granting only the access required for the task minimizes blast radius if credentials are compromised."
- ❌ question: "By what enchantment doth a knight prove twice their identity?" — this MUST be technical: "An enterprise enforces multi-factor authentication on VPN logins. Which factor combination is MOST resistant to phishing attacks?"

QUESTION STYLE (every multiple-choice quiz item):
- Stem ≥2 sentences, scenario-driven (set who, what, where)
- End with a qualifier: BEST, MOST, FIRST, PRIMARY, NEXT, or equivalent
- Distractors must be plausible misconceptions — never throwaway answers
- Bloom's mix across the full quiz: ~30% recall (Remember/Understand), ~50% applied scenario (Apply), ~20% analysis (Analyze/Evaluate)

LAB / PERFORMANCE-BASED QUESTION STYLE:
- \`scenario\` ≥3 sentences and references a realistic situation (incident, audit, deployment, alert, customer request)
- ≥4 stages per lab, mixing MC steps and free-response steps
- Include realistic artifacts where possible (logs, commands, configs, policies, alerts)`;

export const SHARED_FOOTER = `=== OUTPUT FORMAT ===

- Save the result as a downloadable .json file (filename: \`tome-<short-name>.json\`) using whatever file/download capability you have available
- If you cannot create a downloadable file, output the JSON inside a single fenced code block so I can copy it cleanly
- Do not split the JSON across multiple messages — it must be one complete object
- Do not output markdown commentary outside the JSON or code block

Now wait for me to provide the study materials. After receiving them, generate the complete tome.`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dungeon-scholar && npm test -- prompts/_shared.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/home-lab
git add dungeon-scholar/src/prompts/_shared.js dungeon-scholar/src/prompts/_shared.test.js
git commit -m "feat(dungeon-scholar): shared sections for tome-creation prompts

Adds SHARED_HEADER, SHARED_SCHEMA, SHARED_STYLE_RULES, and SHARED_FOOTER
exports — the cross-cutting content every per-org tome-creation prompt
will compose. Schema documents the additive optional 'objective' field
and the required '=== Domain N: <Name> ===' knowledge-base format that
chunks cleanly for the in-app Oracle's RAG retrieval."
```

---

## Task 2: Create `index.js` skeleton with module-shape tests

**Files:**
- Create: `dungeon-scholar/src/prompts/index.js`
- Create: `dungeon-scholar/src/prompts/index.test.js`

- [ ] **Step 1: Write the failing test**

Create `dungeon-scholar/src/prompts/index.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { ORG_PROMPTS } from './index.js';

describe('ORG_PROMPTS', () => {
  it('is an array', () => {
    expect(Array.isArray(ORG_PROMPTS)).toBe(true);
  });

  it('every entry has the required metadata shape', () => {
    for (const p of ORG_PROMPTS) {
      expect(typeof p.id).toBe('string');
      expect(p.id).toMatch(/^[a-z0-9_]+$/);
      expect(typeof p.name).toBe('string');
      expect(typeof p.emoji).toBe('string');
      expect(typeof p.subtitle).toBe('string');
      expect(typeof p.examTargetPlaceholder).toBe('string');
      expect(Array.isArray(p.commonExams)).toBe(true);
      expect(typeof p.prompt).toBe('string');
    }
  });

  it('every id is unique', () => {
    const ids = ORG_PROMPTS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every prompt contains the EXAM TARGET line', () => {
    for (const p of ORG_PROMPTS) {
      expect(p.prompt).toMatch(/EXAM TARGET:/);
    }
  });

  it('every prompt contains the shared schema marker', () => {
    for (const p of ORG_PROMPTS) {
      expect(p.prompt).toMatch(/=== JSON SCHEMA ===/);
    }
  });

  it('every prompt mentions the Domain knowledge-base requirement', () => {
    for (const p of ORG_PROMPTS) {
      expect(p.prompt).toMatch(/=== Domain/);
    }
  });

  it('every prompt mentions the fantasy-leak rule', () => {
    for (const p of ORG_PROMPTS) {
      expect(p.prompt).toMatch(/fantasy/i);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dungeon-scholar && npm test -- prompts/index.test.js`
Expected: FAIL — module not found `./index.js`

- [ ] **Step 3: Create `index.js` with empty array**

Create `dungeon-scholar/src/prompts/index.js`:

```js
export const ORG_PROMPTS = [];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dungeon-scholar && npm test -- prompts/index.test.js`
Expected: PASS (7 tests; loops over empty array trivially pass)

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/home-lab
git add dungeon-scholar/src/prompts/index.js dungeon-scholar/src/prompts/index.test.js
git commit -m "feat(dungeon-scholar): ORG_PROMPTS aggregator skeleton + shape tests

Empty ORG_PROMPTS array with shape-validation tests that every entry must
satisfy. Per-org files added in subsequent commits will populate the array
and the existing tests will continue to validate them."
```

---

## Task 3: Create CompTIA prompt (the reference exemplar)

This is the longest task — CompTIA is the reference all other org prompts pattern after.

**Files:**
- Create: `dungeon-scholar/src/prompts/comptia.js`
- Modify: `dungeon-scholar/src/prompts/index.js`

- [ ] **Step 1: Write the failing test**

Append to `dungeon-scholar/src/prompts/index.test.js`:

```js
describe('CompTIA prompt', () => {
  it('is registered in ORG_PROMPTS', () => {
    const c = ORG_PROMPTS.find(p => p.id === 'comptia');
    expect(c).toBeDefined();
    expect(c.name).toBe('CompTIA');
    expect(c.commonExams).toContain('Security+ SY0-701');
  });

  it('CompTIA prompt mentions PBQ and BEST/MOST qualifiers', () => {
    const c = ORG_PROMPTS.find(p => p.id === 'comptia');
    expect(c.prompt).toMatch(/PBQ|performance-based/i);
    expect(c.prompt).toMatch(/BEST|MOST|FIRST/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dungeon-scholar && npm test -- prompts/index.test.js`
Expected: FAIL — `c is undefined`

- [ ] **Step 3: Create the CompTIA prompt file**

Create `dungeon-scholar/src/prompts/comptia.js`:

```js
import { SHARED_HEADER, SHARED_SCHEMA, SHARED_STYLE_RULES, SHARED_FOOTER } from './_shared.js';

export const COMPTIA_PROMPT_META = {
  id: 'comptia',
  name: 'CompTIA',
  emoji: '📜',
  subtitle: 'Security+, CySA+, Pentest+, Network+, A+',
  examTargetPlaceholder: 'e.g. Security+ SY0-701',
  commonExams: [
    'Security+ SY0-701',
    'CySA+ CS0-003',
    'Pentest+ PT0-003',
    'Network+ N10-009',
    'A+ Core 1/2 (220-1101 / 220-1102)',
    'Linux+ XK0-005',
    'Server+ SK0-005',
    'Cloud+ CV0-004',
  ],
};

export const COMPTIA_PROMPT = `${SHARED_HEADER}

ORGANIZATION: CompTIA

EXAM TARGET: <leave blank to let me infer from materials>

=== ABOUT COMPTIA EXAMS ===

CompTIA exams are vendor-neutral, blueprint-driven, and scenario-heavy. Multiple-choice questions almost always set a real-world IT/security situation in the stem (a SOC analyst, a help desk technician, a network engineer, a compliance officer) and ask which option BEST/MOST/FIRST/NEXT addresses the situation. Distractors are deliberately plausible — common misconceptions, adjacent controls, off-by-one config values, near-synonyms.

Performance-Based Questions (PBQs) simulate hands-on tasks: drag-drop firewall rules, configure a DLP policy, analyze a packet capture, identify malware from a Sysmon log, order incident-response steps, or label network-diagram components. In tome form, encode PBQs as multi-stage \`labs\` with realistic artifacts (log lines, command output, config snippets) embedded in the \`scenario\` and step \`prompt\`.

=== COMMON COMPTIA EXAMS ===

- Security+ SY0-701 (entry-level cybersec; 5 domains; ~90 questions; PBQs)
- CySA+ CS0-003 (analyst; log/packet analysis; CVSS scoring)
- Pentest+ PT0-003 (engagement scoping → recon → exploitation → reporting)
- Network+ N10-009 (networking fundamentals; troubleshooting flowcharts)
- A+ Core 1/2 220-1101/220-1102 (hardware + software + security basics)
- Linux+ XK0-005, Server+ SK0-005, Cloud+ CV0-004

=== BLUEPRINT STRUCTURE ===

CompTIA exams use 5 numbered domains (Security+: 1. General Security Concepts; 2. Threats, Vulnerabilities, and Mitigations; 3. Security Architecture; 4. Security Operations; 5. Security Program Management and Oversight). Each domain has sub-objectives (1.1, 1.2, 1.3, ...). Reference the relevant blueprint for the EXAM TARGET above; if blank, default to Security+ SY0-701's 5-domain structure.

Use \`=== Domain N: <Name> ===\` headers in the knowledge base. Tag each item's \`objective\` field with the sub-objective number (e.g. \`"1.4"\`).

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥80 flashcards
- ≥80 quiz questions (mix multiplechoice / truefalse / fillblank — at least 60% multiplechoice)
- ≥10 labs (PBQ-style, ≥4 stages each)
- Per-blueprint-objective minimums: ≥5 flashcards, ≥5 quiz items, ≥1 lab per sub-objective
- If material is large, scale up proportionally — never below the minimums

=== STYLE GUIDANCE ===

Quiz stems must:
- Be ≥2 sentences, opening with a scenario actor (analyst, technician, administrator, auditor, user)
- End with BEST, MOST, FIRST, PRIMARY, NEXT, or equivalent qualifier
- Use 4 plausible options (3 distractors that look reasonable to a partially-prepared candidate)

Distractor patterns CompTIA loves:
- Same control family but wrong specific control (e.g. WAF vs IPS vs IDS vs proxy)
- Right concept, wrong order (mitigate before contain, eradicate before recover)
- Off-by-one config (port 443 vs 4433, /24 vs /25)
- Near-synonyms with different meaning (authentication vs authorization vs accounting)

Lab/PBQ artifacts to embed:
- Log lines from Sysmon, Windows Event Log, syslog, web server access logs
- nmap, tcpdump, dig, netstat, ipconfig, ip a output
- Firewall ACLs, IPS rules, Snort/Suricata signatures
- Phishing email headers, DNS records, certificate chain output

=== EXEMPLARS ===

✅ GOOD flashcard:

{
  "id": "fc1",
  "front": "Principle of least privilege",
  "back": "A user, process, or system is granted only the access rights and permissions required to perform its specific function — nothing more. Reduces blast radius if credentials are compromised. In practice: separate admin/standard accounts, time-bounded role elevation (JIT), per-resource IAM scoping.",
  "hint": "Think about what happens when a single account is breached — how do you limit the damage?",
  "objective": "1.2"
}

✅ GOOD multiple-choice quiz:

{
  "id": "q1",
  "type": "multiplechoice",
  "question": "A SOC analyst observes outbound connections from a finance workstation to an unfamiliar IP on TCP/443 every 60 seconds. The DNS query immediately preceding each connection resolves a 14-character random-looking subdomain of a free dynamic-DNS provider. Which action should the analyst take FIRST?",
  "options": [
    "Block the destination IP at the perimeter firewall",
    "Isolate the workstation from the network and begin endpoint forensics",
    "Open a ticket asking the user whether they recognize the activity",
    "Add the dynamic-DNS domain to the URL filtering deny list"
  ],
  "correctIndex": 1,
  "explanation": "The pattern (regular beacons, randomized subdomains, dynamic-DNS) strongly suggests command-and-control beaconing from malware. Containment by isolating the host comes BEFORE eradication or perimeter blocking — blocking the IP alone would not stop the malware from rotating to a new C2, and asking the user wastes time. Brave analyst, contain first, investigate second.",
  "hint": "Recall the incident-response order: prepare, identify, contain, eradicate, recover, lessons learned.",
  "objective": "4.8"
}

❌ BAD multiple-choice quiz — DO NOT GENERATE LIKE THIS:

{
  "id": "q_bad",
  "type": "multiplechoice",
  "question": "What does TLS stand for?",
  "options": ["Transport Layer Security", "Tactical Login System", "Transparent Lock Service", "Type Length Storage"],
  "correctIndex": 0
}

Why this is bad: pure recall (no scenario), no qualifier word, distractors are obvious nonsense. CompTIA does not write items this lazy.

✅ GOOD lab (PBQ-style):

{
  "id": "lab1",
  "title": "Triage a phishing alert and recommend mitigations",
  "scenario": "Your SIEM raised a high-priority alert: 47 employees received an email from \\"it-support@compamy.com\\" (note the misspelling) with the subject \\"Mandatory password reset — 24 hours\\" and a link to https://compamy-portal.azurewebsites.net/login. Three users have already clicked the link in the last 8 minutes. The on-call analyst hands you the headers, attachment list, and SIEM dashboard.",
  "objective": "2.4",
  "steps": [
    {
      "prompt": "Inspect the email envelope. The Return-Path is \\"<bounce@maildelivery-svc.com>\\", the From header is \\"IT Support <it-support@compamy.com>\\", and SPF=fail, DKIM=none, DMARC=fail. Which finding is the STRONGEST single indicator that this is a spoofed phishing message?",
      "options": ["The misspelled sender domain", "The DMARC=fail result", "The mismatched Return-Path domain", "All three together"],
      "correctIndex": 3,
      "explanation": "Any one of these is suspicious; together they are damning. CompTIA scenarios reward holistic reasoning — the BEST answer accounts for all evidence, not the loudest single signal."
    },
    {
      "prompt": "Three users clicked the link. What is the FIRST containment action?",
      "options": ["Force a password reset for the three users", "Block the malicious URL at the proxy/EDR for all users", "Quarantine the email from all 47 inboxes", "Run an EDR scan on the three users' endpoints"],
      "correctIndex": 1,
      "explanation": "Block the URL FIRST so the remaining 44 users (and any future click-throughs) cannot reach the credential-harvesting page. Password resets, mailbox quarantine, and endpoint scans follow — but stopping the bleeding comes first."
    },
    {
      "prompt": "Type the regex you would use in your email gateway to flag any future inbound mail whose From-domain visually resembles your real domain (compamy vs company). One acceptable answer: a regex matching domains within edit-distance 1 of your real domain.",
      "acceptedAnswers": ["compa[a-z]{1,3}y\\\\.com", "comp[a-z]{1,3}\\\\.com", "compamy\\\\.com", "company\\\\.com"],
      "explanation": "Any regex that catches typo-squatted variants of your domain is acceptable. In practice, gateways use homoglyph + edit-distance detection."
    },
    {
      "prompt": "After eradication, which control would BEST prevent recurrence with minimal user friction?",
      "options": ["Mandatory weekly anti-phishing training videos", "Enforce phishing-resistant MFA (FIDO2/WebAuthn) for all SSO logins", "Block all external email containing URLs", "Disable email entirely for finance users"],
      "correctIndex": 1,
      "explanation": "Phishing-resistant MFA defeats credential theft even if users click. Training reduces but does not eliminate clicks; option 3 breaks legitimate workflow; option 4 is absurd. Brave defender, the answer is the control that holds even when the user fails."
    }
  ]
}

❌ FANTASY LEAK — NEVER:

{
  "id": "q_leak",
  "type": "multiplechoice",
  "question": "Lo, a knight-errant of the SOC doth spy a beacon most foul. By what enchantment shall the brave scholar contain the fell creature?",
  "options": ["Ye Firewall of Holding", "The Sword of Isolation", "The Scroll of Ticketing", "The Tome of Logs"]
}

Technical content fields MUST be exam-realistic. Fantasy stays in \`explanation\` and \`hint\`.

${SHARED_SCHEMA}

${SHARED_STYLE_RULES}

${SHARED_FOOTER}`;
```

- [ ] **Step 4: Wire CompTIA into the index**

Edit `dungeon-scholar/src/prompts/index.js`:

```js
import { COMPTIA_PROMPT, COMPTIA_PROMPT_META } from './comptia.js';

export const ORG_PROMPTS = [
  { ...COMPTIA_PROMPT_META, prompt: COMPTIA_PROMPT },
];
```

- [ ] **Step 5: Run tests**

Run: `cd dungeon-scholar && npm test -- prompts/`
Expected: PASS (existing 4 _shared tests + 7 index shape tests + 2 new CompTIA tests = 13)

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/home-lab
git add dungeon-scholar/src/prompts/comptia.js dungeon-scholar/src/prompts/index.js dungeon-scholar/src/prompts/index.test.js
git commit -m "feat(dungeon-scholar): CompTIA tome-creation prompt

Reference per-org prompt: scenario-style MC stems with BEST/MOST/FIRST
qualifiers, plausible-distractor patterns, multi-stage PBQ-style labs
with realistic artifacts (logs, regex, command output), and one fantasy-
leak anti-pattern. Wired into ORG_PROMPTS aggregator. Subsequent org
prompts will pattern after this exemplar."
```

---

## Task 4: Create AWS prompt

**Files:**
- Create: `dungeon-scholar/src/prompts/aws.js`
- Modify: `dungeon-scholar/src/prompts/index.js`
- Modify: `dungeon-scholar/src/prompts/index.test.js`

- [ ] **Step 1: Append failing tests**

Append to `dungeon-scholar/src/prompts/index.test.js`:

```js
describe('AWS prompt', () => {
  it('is registered with id="aws" and lists Security Specialty', () => {
    const a = ORG_PROMPTS.find(p => p.id === 'aws');
    expect(a).toBeDefined();
    expect(a.commonExams.some(e => e.includes('SCS'))).toBe(true);
  });

  it('mentions IAM, KMS, and Well-Architected', () => {
    const a = ORG_PROMPTS.find(p => p.id === 'aws');
    expect(a.prompt).toMatch(/IAM/);
    expect(a.prompt).toMatch(/KMS/);
    expect(a.prompt).toMatch(/Well-Architected/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd dungeon-scholar && npm test -- prompts/index.test.js`
Expected: FAIL — `a is undefined`

- [ ] **Step 3: Create the AWS prompt file**

Create `dungeon-scholar/src/prompts/aws.js`:

```js
import { SHARED_HEADER, SHARED_SCHEMA, SHARED_STYLE_RULES, SHARED_FOOTER } from './_shared.js';

export const AWS_PROMPT_META = {
  id: 'aws',
  name: 'AWS',
  emoji: '☁️',
  subtitle: 'Cloud Practitioner, SAA, Security Specialty, SCS, SysOps, Devs',
  examTargetPlaceholder: 'e.g. Security Specialty SCS-C02',
  commonExams: [
    'Cloud Practitioner CLF-C02',
    'Solutions Architect Associate SAA-C03',
    'Security Specialty SCS-C02',
    'Solutions Architect Professional SAP-C02',
    'DevOps Engineer Pro DOP-C02',
    'SysOps Admin SOA-C02',
    'Developer Associate DVA-C02',
    'Data Engineer DEA-C01',
    'Machine Learning Associate MLA-C01',
    'Advanced Networking ANS-C01',
  ],
};

export const AWS_PROMPT = `${SHARED_HEADER}

ORGANIZATION: AWS

EXAM TARGET: <leave blank to let me infer from materials>

=== ABOUT AWS EXAMS ===

AWS exams are scenario-architect: each multiple-choice item describes a customer's situation ("a company is migrating workloads...", "an application processes regulated PHI...") and asks which AWS service combination, configuration, or design pattern BEST/MOST satisfies the requirement at lowest cost / highest availability / least operational overhead. AWS rewards candidates who can map a requirement to the right primitive and reject distractors that work but cost more, scale worse, or violate the Well-Architected pillars (Security, Reliability, Performance, Cost, Operational Excellence, Sustainability).

Distractors are typically other AWS services that *almost* fit (S3 vs EFS vs FSx; SQS vs SNS vs Kinesis; IAM roles vs IAM users vs STS; KMS CMK vs SSE-S3 vs client-side). The candidate must know not just what each service does but when it is the BEST choice.

=== COMMON AWS EXAMS ===

- Cloud Practitioner CLF-C02 (foundational; broad service awareness)
- Solutions Architect Associate SAA-C03 (design resilient/secure/cost-effective architectures)
- Security Specialty SCS-C02 (deep IAM, KMS, GuardDuty, Macie, Detective, Inspector, Security Hub)
- Solutions Architect Professional SAP-C02, DevOps Engineer Pro DOP-C02
- SysOps Admin SOA-C02, Developer Associate DVA-C02, Data Engineer DEA-C01
- Machine Learning MLA-C01, Advanced Networking ANS-C01

=== BLUEPRINT STRUCTURE ===

AWS exams group objectives by service category or task domain. Security Specialty (SCS-C02) uses 6 domains: Threat Detection and Incident Response, Security Logging and Monitoring, Infrastructure Security, Identity and Access Management, Data Protection, Management and Security Governance. SAA-C03 uses 4 domains: Design Secure Architectures, Design Resilient Architectures, Design High-Performing Architectures, Design Cost-Optimized Architectures.

Use \`=== Domain N: <Name> ===\` headers in the knowledge base. Tag each item's \`objective\` field with the domain name or service area (e.g. \`"IAM"\`, \`"Domain 4 — Identity and Access Management"\`, \`"Data Protection — KMS"\`).

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥80 flashcards
- ≥80 quiz questions (mostly multiplechoice; AWS exams are MC-heavy)
- ≥10 labs (service-scenario design exercises)
- ≥5 flashcards, ≥5 quiz items, ≥1 lab per domain
- Cover the major service primitives the EXAM TARGET specifies — IAM, KMS, S3, VPC, EC2, RDS, Lambda, CloudTrail, CloudWatch, Config, GuardDuty, Security Hub, WAF/Shield/Network Firewall, etc.

=== STYLE GUIDANCE ===

Quiz stems must:
- Open with a customer/company scenario (workload, compliance need, cost constraint, scale target)
- End with BEST, MOST cost-effective, MOST secure, MOST scalable, MOST highly-available, or LEAST operational overhead
- Force the candidate to choose between similar AWS services or configurations

Distractor patterns AWS loves:
- Service that works but at higher cost (e.g. EFS when S3 + lifecycle would do)
- Service that scales worse (e.g. EC2 + ELB when API Gateway + Lambda would auto-scale)
- Configuration that violates least privilege (wildcards in IAM policies)
- Pattern that ignores Well-Architected pillars (single-AZ when multi-AZ is needed)
- IAM users when IAM roles or STS would be the right answer

Lab/PBQ artifacts to embed:
- IAM policy JSON snippets
- KMS key policy / grant JSON
- S3 bucket policy or ACL
- VPC route table / NACL / SG rule listings
- CloudTrail event JSON
- CLI commands (\`aws s3 cp\`, \`aws iam simulate-principal-policy\`, etc.)

=== EXEMPLARS ===

✅ GOOD flashcard:

{
  "id": "fc1",
  "front": "S3 bucket encryption: SSE-S3 vs SSE-KMS vs SSE-C — when to use each",
  "back": "SSE-S3: AWS-managed keys, simplest, no per-request KMS cost. SSE-KMS: customer-managed CMK, key rotation, audit trail in CloudTrail, per-request KMS API cost (and KMS RPS limit may bottleneck high-throughput workloads). SSE-C: customer-supplied keys, AWS does not store the key — caller must supply on every request. Use SSE-KMS when you need granular access policies, CloudTrail audit, or cross-account decryption controls.",
  "hint": "Ask: who manages the key, who pays per request, who audits decrypt operations?",
  "objective": "Domain 5 — Data Protection"
}

✅ GOOD multiple-choice quiz:

{
  "id": "q1",
  "type": "multiplechoice",
  "question": "A SaaS company runs a multi-tenant web application on Amazon ECS Fargate behind an Application Load Balancer. Each tenant uploads documents that must remain isolated — no tenant may read another tenant's files even if a service account is compromised. The platform team wants to minimize blast radius and operational overhead. Which approach is the MOST secure and operationally simple?",
  "options": [
    "Single S3 bucket with key prefixes per tenant (e.g. /tenant-A/, /tenant-B/) and a shared IAM role granting full bucket access",
    "Single S3 bucket with key prefixes per tenant and an IAM role per task that uses session policies derived from the tenant ID at request time",
    "One S3 bucket per tenant with a unique IAM role per bucket, assumed via STS using the tenant's identity",
    "Single S3 bucket with an S3 bucket policy referencing aws:userid wildcards"
  ],
  "correctIndex": 2,
  "explanation": "Per-tenant buckets with per-tenant IAM roles give the strongest isolation: a leaked role for tenant A cannot read tenant B's bucket. Option 1 leaks across all tenants if the shared role is compromised. Option 2 is operationally heavier and still relies on session-policy correctness at request time. Option 4 is fragile and bucket-policy-only enforcement is easy to misconfigure. Brave architect, defense-in-depth means separating the trust boundary at the resource level when feasible."
}

❌ BAD multiple-choice quiz:

{
  "id": "q_bad",
  "type": "multiplechoice",
  "question": "What service does AWS provide for object storage?",
  "options": ["S3", "EC2", "Lambda", "RDS"],
  "correctIndex": 0
}

Why this is bad: pure recall, no scenario, no qualifier, distractors are different service categories (obviously wrong). AWS exam writers do not write items this lazy.

✅ GOOD lab (service-scenario design):

{
  "id": "lab1",
  "title": "Design encryption-at-rest for a HIPAA-regulated EHR workload",
  "scenario": "A healthcare startup is launching an EHR platform on AWS. PHI lands in S3 (uploaded patient documents), Aurora PostgreSQL (structured records), and EFS (clinician scratch space for PDF generation). Compliance requires: customer-managed key material, key rotation every 365 days, ability to revoke key access immediately if a contractor leaves, and CloudTrail audit of every decrypt operation.",
  "objective": "Domain 5 — Data Protection",
  "steps": [
    {
      "prompt": "Which AWS service satisfies all four compliance requirements with the LEAST integration work?",
      "options": ["AWS KMS with customer-managed CMKs (single key)", "AWS KMS with customer-managed CMKs (one per service)", "AWS CloudHSM cluster", "AWS Secrets Manager"],
      "correctIndex": 1,
      "explanation": "KMS CMKs satisfy all four (rotation, revocation via key policy, CloudTrail audit, customer-managed material). One CMK per service (S3, Aurora, EFS) reduces blast radius and lets you tune key policies per workload. CloudHSM is overkill and operationally heavy unless FIPS 140-2 Level 3 is required. Secrets Manager is for credentials, not data encryption keys."
    },
    {
      "prompt": "Write the IAM policy condition that restricts S3 GetObject decrypt operations on the EHR bucket to the application's IAM role only. The condition uses the kms:ViaService key.",
      "acceptedAnswers": [
        "\\"kms:ViaService\\": \\"s3.us-east-1.amazonaws.com\\"",
        "kms:ViaService = s3.<region>.amazonaws.com",
        "kms:ViaService"
      ],
      "explanation": "kms:ViaService restricts use of the CMK to API calls originating from a specific AWS service, so even if the role is misused outside S3, decrypt fails."
    },
    {
      "prompt": "Aurora encryption-at-rest uses the chosen CMK at cluster creation. Can you change the CMK on an existing Aurora cluster?",
      "options": ["Yes, via ModifyDBCluster API", "Yes, but only via console", "No — encryption-at-rest CMK is immutable; create a new encrypted cluster and migrate data", "Yes, via a snapshot/restore cycle that re-encrypts during restore"],
      "correctIndex": 3,
      "explanation": "Aurora's encryption CMK is immutable on the live cluster, but a snapshot can be re-encrypted to a different CMK during restore — that is the supported migration path."
    },
    {
      "prompt": "An auditor requests proof that no IAM principal decrypted PHI keys outside business hours. Which CloudTrail event name and field combination supports the query?",
      "options": [
        "Decrypt event with kms.amazonaws.com source",
        "DecryptObject event with s3.amazonaws.com source",
        "GetObject event with x-amz-server-side-encryption-aws-kms-key-id field",
        "kms:Decrypt requestParameters.keyId combined with eventTime filter"
      ],
      "correctIndex": 3,
      "explanation": "The Decrypt API call appears in CloudTrail with eventName=Decrypt, eventSource=kms.amazonaws.com, and requestParameters.keyId identifying the CMK. Filter by eventTime to scope to outside business hours."
    }
  ]
}

❌ FANTASY LEAK — NEVER:

{
  "id": "q_leak",
  "type": "multiplechoice",
  "question": "What service doth the brave cloudsmith use to lock data in a vault of light?",
  "options": ["KMS", "S3", "EC2", "VPC"]
}

Technical fields stay technical. Mild fantasy is for explanations and hints only.

${SHARED_SCHEMA}

${SHARED_STYLE_RULES}

${SHARED_FOOTER}`;
```

- [ ] **Step 4: Wire AWS into the index**

Edit `dungeon-scholar/src/prompts/index.js`:

```js
import { COMPTIA_PROMPT, COMPTIA_PROMPT_META } from './comptia.js';
import { AWS_PROMPT, AWS_PROMPT_META } from './aws.js';

export const ORG_PROMPTS = [
  { ...AWS_PROMPT_META, prompt: AWS_PROMPT },
  { ...COMPTIA_PROMPT_META, prompt: COMPTIA_PROMPT },
];
```

- [ ] **Step 5: Run tests**

Run: `cd dungeon-scholar && npm test -- prompts/`
Expected: PASS — all existing tests + 2 new AWS tests

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/home-lab
git add dungeon-scholar/src/prompts/aws.js dungeon-scholar/src/prompts/index.js dungeon-scholar/src/prompts/index.test.js
git commit -m "feat(dungeon-scholar): AWS tome-creation prompt

Service-scenario MC stems with BEST/MOST cost-effective/secure qualifiers,
distractor patterns drawn from adjacent AWS services, multi-stage labs
with IAM policy / KMS / CloudTrail artifacts, fantasy-leak anti-pattern.
Covers SAA, SCS, and adjacent associate/professional/specialty exams."
```

---

## Task 5: Create Cisco prompt

**Files:**
- Create: `dungeon-scholar/src/prompts/cisco.js`
- Modify: `dungeon-scholar/src/prompts/index.js`
- Modify: `dungeon-scholar/src/prompts/index.test.js`

- [ ] **Step 1: Append failing tests**

Append to `dungeon-scholar/src/prompts/index.test.js`:

```js
describe('Cisco prompt', () => {
  it('is registered with id="cisco" and lists CCNA', () => {
    const c = ORG_PROMPTS.find(p => p.id === 'cisco');
    expect(c).toBeDefined();
    expect(c.commonExams.some(e => e.includes('CCNA'))).toBe(true);
  });

  it('mentions IOS and CLI commands', () => {
    const c = ORG_PROMPTS.find(p => p.id === 'cisco');
    expect(c.prompt).toMatch(/IOS/);
    expect(c.prompt).toMatch(/show |configure terminal|CLI/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd dungeon-scholar && npm test -- prompts/index.test.js`
Expected: FAIL — `c is undefined`

- [ ] **Step 3: Create the Cisco prompt file**

Create `dungeon-scholar/src/prompts/cisco.js`:

```js
import { SHARED_HEADER, SHARED_SCHEMA, SHARED_STYLE_RULES, SHARED_FOOTER } from './_shared.js';

export const CISCO_PROMPT_META = {
  id: 'cisco',
  name: 'Cisco',
  emoji: '⚔️',
  subtitle: 'CCNA, CCNP Security, CCIE, CyberOps Assoc/Pro',
  examTargetPlaceholder: 'e.g. CCNA 200-301',
  commonExams: [
    'CCNA 200-301',
    'CCNP Security SCOR 350-701',
    'CCIE Security',
    'CyberOps Associate 200-201 (CBROPS)',
    'CyberOps Professional 350-201 / 300-215',
    'DevNet Associate',
  ],
};

export const CISCO_PROMPT = `${SHARED_HEADER}

ORGANIZATION: Cisco

EXAM TARGET: <leave blank to let me infer from materials>

=== ABOUT CISCO EXAMS ===

Cisco exams test deep networking and security knowledge with a strong CLI bias. Many items present a partial running-config or \`show\` output and ask the candidate to identify the misconfiguration, predict the next packet's path, or pick the BEST command to remediate. Simulation/sim-let portions of the exam place the candidate at a real (or emulated) IOS prompt and require typing the actual commands.

Distractors lean heavily on close command syntax (\`switchport mode access\` vs \`switchport access vlan\` vs \`switchport mode trunk\`), off-by-one timer values, and protocol-version differences (OSPFv2 vs OSPFv3, EIGRP for IPv4 vs IPv6). Cisco rewards candidates who can read \`show ip route\`, \`show ip ospf neighbor\`, \`show interfaces trunk\`, and \`show running-config\` like prose.

=== COMMON CISCO EXAMS ===

- CCNA 200-301 (associate-level routing/switching/security/automation)
- CCNP Security SCOR 350-701 (NGFW, ISE, Umbrella, Stealthwatch, AMP)
- CCIE Security (lab-based; 8-hour hands-on)
- CyberOps Associate CBROPS 200-201 (SOC analyst; logs, IOCs, NIST framework)
- CyberOps Professional 350-201 + 300-215 (incident response, forensics)
- DevNet Associate (Cisco APIs, automation)

=== BLUEPRINT STRUCTURE ===

CCNA 200-301 has 6 domains: Network Fundamentals, Network Access, IP Connectivity, IP Services, Security Fundamentals, Automation and Programmability. CCNP Security SCOR has 6 domains: Security Concepts, Network Security, Cloud Security, Content Security, Endpoint Protection, Secure Network Access/Visibility/Enforcement. CyberOps CBROPS has 5 domains: Security Concepts, Security Monitoring, Host-Based Analysis, Network Intrusion Analysis, Security Policies and Procedures.

Use \`=== Domain N: <Name> ===\` headers in the knowledge base. Tag each item's \`objective\` field with the domain or sub-objective.

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥80 flashcards
- ≥80 quiz questions (multiplechoice + fillblank for command syntax)
- ≥8 labs (CLI-scenario heavy: read configs, predict packet flow, fix misconfigurations)
- ≥5 flashcards, ≥5 quiz items, ≥1 lab per domain
- Cover IOS configuration, troubleshooting commands, and the EXAM TARGET's protocol/feature set

=== STYLE GUIDANCE ===

Quiz stems must:
- Frequently include a configuration excerpt or \`show\` output
- Ask which command BEST fixes / configures / verifies the situation
- Use fillblank for exact command syntax (e.g. "Type the IOS command that displays the ARP table.")

Distractor patterns Cisco loves:
- Close-but-wrong command syntax (no-shutdown vs shutdown vs no shut)
- Wrong interface mode (access vs trunk vs dynamic auto)
- Wrong protocol version
- Configuration-mode confusion (global config vs interface config vs line config)

Lab/PBQ artifacts to embed:
- \`show running-config\` excerpts (interface, routing, ACL sections)
- \`show ip route\`, \`show ip ospf neighbor\`, \`show interfaces trunk\` output
- ACL listings with line numbers
- Packet captures (Wireshark output text form, or a description of frames)
- CLI prompts (\`Router(config-if)#\`, \`Switch#\`)

=== EXEMPLARS ===

✅ GOOD flashcard:

{
  "id": "fc1",
  "front": "Difference between switchport mode access and switchport mode trunk",
  "back": "switchport mode access — interface carries traffic for exactly one VLAN (the access VLAN); incoming 802.1Q tags are dropped. Used for end-host ports (workstations, phones, APs in some cases). switchport mode trunk — interface carries traffic for multiple VLANs and tags frames with 802.1Q (except the native VLAN); used for switch-to-switch links. Common misconfig: leaving an end-host port in default 'dynamic auto' lets a malicious host negotiate trunking and VLAN-hop.",
  "hint": "Ask: does this port talk to one VLAN or many?",
  "objective": "Network Access"
}

✅ GOOD multiple-choice quiz:

{
  "id": "q1",
  "type": "multiplechoice",
  "question": "A network engineer attempts to ping a host on VLAN 20 from a host on VLAN 10. The router-on-a-stick is configured with subinterfaces Gi0/0.10 (encapsulation dot1Q 10, IP 10.10.10.1/24) and Gi0/0.20 (encapsulation dot1Q 20, IP 10.10.20.1/24). The trunk to the switch is up but the ping fails. Output of 'show interfaces gi0/0.10' shows the line protocol is up. What is the MOST likely cause?",
  "options": [
    "The native VLAN on the trunk does not match between switch and router",
    "The hosts have the wrong default gateway configured",
    "The subinterfaces need 'no shutdown' on each",
    "VLAN 10 and VLAN 20 are in different VRFs"
  ],
  "correctIndex": 1,
  "explanation": "The router subinterfaces are up/up, the trunk is up, and the encapsulation matches — at the router/switch layer everything is fine. The most common end-user-visible failure here is the host pointing at the wrong default gateway (or no gateway at all), which silently drops inter-VLAN traffic at the host. Native-VLAN mismatch generates a CDP/STP error but does not necessarily break the data plane for tagged VLANs."
}

❌ BAD multiple-choice quiz:

{
  "id": "q_bad",
  "type": "multiplechoice",
  "question": "What does CCNA stand for?",
  "options": ["Cisco Certified Network Associate", "Common Cloud Network Architect", "Cisco Cloud Network Associate", "Certified Cisco Network Admin"],
  "correctIndex": 0
}

Why this is bad: pure recall, distractors are nonsense brand variations. Cisco does not test brand trivia.

✅ GOOD lab (CLI-scenario):

{
  "id": "lab1",
  "title": "Diagnose and fix a broken inter-VLAN routing setup",
  "scenario": "A junior tech configured router-on-a-stick on R1 and a trunk on SW1. Hosts in VLAN 10 cannot reach hosts in VLAN 20. Below is 'show running-config' from R1's Gi0/0 and the trunk on SW1 Fa0/24. R1 Gi0/0 (no IP address, no shutdown). R1 Gi0/0.10 (encapsulation dot1Q 10, IP 192.168.10.1/24, no shutdown). R1 Gi0/0.20 (encapsulation dot1Q 30, IP 192.168.20.1/24, no shutdown). SW1 Fa0/24 (switchport trunk encapsulation dot1q, switchport mode trunk, switchport trunk allowed vlan 10,20).",
  "objective": "IP Connectivity",
  "steps": [
    {
      "prompt": "Identify the misconfiguration in R1's running-config that breaks VLAN 20 routing.",
      "options": ["Gi0/0 has no IP address", "Gi0/0.20 has 'encapsulation dot1Q 30' but the VLAN is 20", "The trunk does not allow VLAN 30", "Native VLAN is unset"],
      "correctIndex": 1,
      "explanation": "The subinterface tag must match the VLAN ID. dot1Q 30 on the .20 subinterface means the router is expecting frames tagged 30, but the switch tags them 20. Brave engineer, frame tags must align across the trunk."
    },
    {
      "prompt": "Type the exact configuration commands (in order) to fix this on R1, starting from 'configure terminal'. Use minimal commands.",
      "acceptedAnswers": [
        "configure terminal\\ninterface gi0/0.20\\nencapsulation dot1Q 20",
        "conf t\\ninterface gi0/0.20\\nencapsulation dot1Q 20",
        "interface gi0/0.20\\nencapsulation dot1Q 20"
      ],
      "explanation": "The fix is to change the encapsulation tag on Gi0/0.20 to match VLAN 20."
    },
    {
      "prompt": "After applying the fix, which 'show' command would BEST verify that R1 is now associating Gi0/0.20 with VLAN 20?",
      "options": ["show ip route", "show interfaces gi0/0.20", "show vlan brief", "show running-config interface gi0/0.20"],
      "correctIndex": 3,
      "explanation": "show running-config interface gi0/0.20 confirms the new encapsulation. show interfaces shows up/up (was already up). show vlan brief is a switch command, not router."
    },
    {
      "prompt": "Why is it important to set the native VLAN on the trunk to a value not used for user data (e.g. VLAN 999)?",
      "options": [
        "Because the native VLAN must match between switches",
        "Because untagged frames belong to the native VLAN — putting a user VLAN as native risks VLAN-hopping via double-tagging",
        "Because IOS requires it",
        "Because OSPF runs on the native VLAN"
      ],
      "correctIndex": 1,
      "explanation": "VLAN-hopping via double-tagged 802.1Q frames is feasible if the attacker's access VLAN matches the trunk's native VLAN. Setting the native to an unused VLAN closes that vector."
    }
  ]
}

❌ FANTASY LEAK — NEVER:

{
  "id": "q_leak",
  "type": "fillblank",
  "question": "By what magical incantation doth the brave engineer reveal the routing table?",
  "acceptedAnswers": ["show ip route"]
}

Technical fields stay technical.

${SHARED_SCHEMA}

${SHARED_STYLE_RULES}

${SHARED_FOOTER}`;
```

- [ ] **Step 4: Wire Cisco into the index**

Edit `dungeon-scholar/src/prompts/index.js`:

```js
import { AWS_PROMPT, AWS_PROMPT_META } from './aws.js';
import { CISCO_PROMPT, CISCO_PROMPT_META } from './cisco.js';
import { COMPTIA_PROMPT, COMPTIA_PROMPT_META } from './comptia.js';

export const ORG_PROMPTS = [
  { ...AWS_PROMPT_META, prompt: AWS_PROMPT },
  { ...CISCO_PROMPT_META, prompt: CISCO_PROMPT },
  { ...COMPTIA_PROMPT_META, prompt: COMPTIA_PROMPT },
];
```

- [ ] **Step 5: Run tests**

Run: `cd dungeon-scholar && npm test -- prompts/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/home-lab
git add dungeon-scholar/src/prompts/cisco.js dungeon-scholar/src/prompts/index.js dungeon-scholar/src/prompts/index.test.js
git commit -m "feat(dungeon-scholar): Cisco tome-creation prompt

CLI-heavy scenario stems with running-config / show output, fillblank
for exact command syntax, multi-stage labs with router-on-a-stick / VLAN
/ trunk troubleshooting, distractor patterns drawn from close-but-wrong
IOS commands. Covers CCNA, CCNP Security, CyberOps."
```

---

## Task 6: Create CMMC prompt

**Files:**
- Create: `dungeon-scholar/src/prompts/cmmc.js`
- Modify: `dungeon-scholar/src/prompts/index.js`
- Modify: `dungeon-scholar/src/prompts/index.test.js`

- [ ] **Step 1: Append failing tests**

```js
describe('CMMC prompt', () => {
  it('is registered with id="cmmc" and references NIST 800-171', () => {
    const c = ORG_PROMPTS.find(p => p.id === 'cmmc');
    expect(c).toBeDefined();
    expect(c.prompt).toMatch(/800-171/);
  });

  it('mentions Levels 1-3 and control assessment', () => {
    const c = ORG_PROMPTS.find(p => p.id === 'cmmc');
    expect(c.prompt).toMatch(/Level [123]/);
    expect(c.prompt).toMatch(/practice|control/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd dungeon-scholar && npm test -- prompts/index.test.js`
Expected: FAIL

- [ ] **Step 3: Create the CMMC prompt file**

Create `dungeon-scholar/src/prompts/cmmc.js`:

```js
import { SHARED_HEADER, SHARED_SCHEMA, SHARED_STYLE_RULES, SHARED_FOOTER } from './_shared.js';

export const CMMC_PROMPT_META = {
  id: 'cmmc',
  name: 'CMMC',
  emoji: '🛡️',
  subtitle: 'Levels 1-3, NIST 800-171/172 mapping, CCP, CCA',
  examTargetPlaceholder: 'e.g. CMMC Level 2 / CCP',
  commonExams: [
    'CMMC Level 1 (Foundational)',
    'CMMC Level 2 (Advanced)',
    'CMMC Level 3 (Expert)',
    'CCP — Certified CMMC Professional',
    'CCA — Certified CMMC Assessor',
  ],
};

export const CMMC_PROMPT = `${SHARED_HEADER}

ORGANIZATION: CMMC (Cybersecurity Maturity Model Certification — DoD/CyberAB)

EXAM TARGET: <leave blank to let me infer from materials>

=== ABOUT CMMC EXAMS ===

CMMC certification testing (CCP, CCA) and Level-1/2/3 assessment knowledge are evidence-driven and framework-mapped. The candidate is expected to know each NIST SP 800-171 / 800-172 practice (control), what level it lives at, what objectives the assessor must verify, and what evidence satisfies the practice. Items frequently present an OSC (Organization Seeking Certification) artifact — a policy excerpt, a configuration, an interview note, a screenshot description — and ask whether it meets the practice, partially meets it, or fails.

Distractors lean on adjacent practices in the same family (AC.L2-3.1.1 vs AC.L2-3.1.2), wrong assessment objectives, and right-control-wrong-level confusion (a Level 2 practice masquerading as Level 1).

=== COMMON CMMC EXAMS / PROGRAMS ===

- CMMC Level 1 (17 practices, FCI protection, self-attestation)
- CMMC Level 2 (110 practices from NIST 800-171, CUI protection, third-party assessment)
- CMMC Level 3 (Level 2 + selected NIST 800-172 enhanced practices, government assessment)
- CCP — Certified CMMC Professional (knowledge of model + assessment process)
- CCA — Certified CMMC Assessor (Level 2 assessment authority)

=== BLUEPRINT STRUCTURE ===

CMMC organizes practices into 14 domains drawn from NIST 800-171: Access Control (AC), Awareness and Training (AT), Audit and Accountability (AU), Configuration Management (CM), Identification and Authentication (IA), Incident Response (IR), Maintenance (MA), Media Protection (MP), Personnel Security (PS), Physical Protection (PE), Risk Assessment (RA), Security Assessment (CA), System and Communications Protection (SC), System and Information Integrity (SI). Practice IDs follow \`<DOMAIN>.L<LEVEL>-<NIST>\` format (e.g. \`AC.L2-3.1.1\`, \`SI.L2-3.14.6\`).

Use \`=== Domain N: <Two-letter code> — <Name> ===\` headers in the knowledge base. Tag each item's \`objective\` with the practice ID.

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥60 flashcards (one per practice for Level 1; one per practice family for Level 2)
- ≥80 quiz questions
- ≥8 labs (control-assessment scenarios)
- ≥5 flashcards, ≥5 quiz items, ≥1 lab per domain (14 domains)
- Cover the assessment objectives the EXAM TARGET specifies

=== STYLE GUIDANCE ===

Quiz stems must:
- Open with an OSC scenario (a defense contractor, a sub, an MSP) or an assessor's observation
- Often present an artifact excerpt (policy, config, interview note)
- Ask which practice this evidence satisfies, partially satisfies, or fails — or which practice is at the WRONG level

Distractor patterns CMMC loves:
- Adjacent practice ID in the same family (3.1.1 vs 3.1.2)
- Right control concept, wrong CMMC level (Level 1 vs Level 2)
- Confusing FCI (Federal Contract Information, Level 1) with CUI (Controlled Unclassified Information, Level 2)
- Mixing up assessor methods (examine, interview, test)

Lab/PBQ artifacts to embed:
- Policy excerpts ("All users shall...")
- Group Policy / configuration screenshots described as text
- Interview notes from a system administrator
- Screenshots of audit log entries
- POA&M (Plan of Action and Milestones) entries

=== EXEMPLARS ===

✅ GOOD flashcard:

{
  "id": "fc1",
  "front": "AC.L2-3.1.1 — Limit system access to authorized users, processes, and devices",
  "back": "Practice: limit system access to authorized users, processes acting on behalf of authorized users, and devices (including other systems). Objectives: identify authorized users, identify authorized processes, identify authorized devices, limit access. Evidence: account inventory, IAM/AD listings, NAC config, joining/onboarding procedure. Common gap: shared service accounts with no owner attribution.",
  "hint": "Three things must be authorized: users, processes, devices. The 'limit' verb is the heart of the practice.",
  "objective": "AC.L2-3.1.1"
}

✅ GOOD multiple-choice quiz:

{
  "id": "q1",
  "type": "multiplechoice",
  "question": "An assessor reviewing an OSC's Level 2 readiness examines the system administrator's interview notes: 'We rotate the shared admin password every 90 days and only three engineers know it.' Which CMMC practice does this evidence MOST directly fail?",
  "options": [
    "AC.L2-3.1.1 (Limit system access to authorized users, processes, and devices)",
    "IA.L2-3.5.1 (Identify system users, processes, and devices)",
    "IA.L2-3.5.2 (Authenticate the identities of users, processes, or devices)",
    "AU.L2-3.3.1 (Create and retain system audit logs and records)"
  ],
  "correctIndex": 1,
  "explanation": "Shared admin credentials defeat individual user identification — IA.L2-3.5.1 requires identifying users, not just authenticating an account. AC.L2-3.1.1 is also weakened, but IA.L2-3.5.1 is the MOST direct failure: you literally cannot tell which engineer made which change. Audit logs (AU.L2-3.3.1) are downstream-affected but the upstream cause is the shared identity. Brave assessor, identification precedes accountability."
}

❌ BAD multiple-choice quiz:

{
  "id": "q_bad",
  "type": "multiplechoice",
  "question": "How many CMMC levels are there?",
  "options": ["1", "2", "3", "5"],
  "correctIndex": 2,
  "explanation": "Three levels"
}

Why this is bad: trivia, no scenario, no qualifier. CMMC exams test application of the framework, not numeric trivia.

✅ GOOD lab (assessment scenario):

{
  "id": "lab1",
  "title": "Score an OSC's Access Control evidence package",
  "scenario": "You are a CCA conducting a Level 2 assessment for a small defense subcontractor. They submit the following evidence for the AC family: (a) a written 'Account Management Policy' last updated 3 years ago; (b) an Active Directory export showing 47 user accounts including 12 marked 'service' with no owner field; (c) interview notes from the IT lead stating 'we disable accounts when HR tells us'; (d) no documented procedure for periodic account review.",
  "objective": "AC.L2",
  "steps": [
    {
      "prompt": "Which AC practice is MOST clearly NOT MET by the submitted evidence?",
      "options": [
        "AC.L2-3.1.1 (Limit system access to authorized users, processes, and devices)",
        "AC.L2-3.1.2 (Limit system access to the types of transactions and functions that authorized users are permitted to execute)",
        "AC.L2-3.1.5 (Employ the principle of least privilege)",
        "AC.L2-3.1.6 (Use non-privileged accounts when accessing nonsecurity functions)"
      ],
      "correctIndex": 0,
      "explanation": "12 service accounts with no owner attribution and no periodic review procedure means access is not adequately limited or governed — fail at AC.L2-3.1.1. The other practices may also be partially impacted but 3.1.1 is the foundational gap."
    },
    {
      "prompt": "What single piece of remediation evidence would MOST efficiently move this finding from 'Not Met' to 'Met'?",
      "options": [
        "A new policy document",
        "A documented account-review procedure plus quarterly review records and an updated AD export with owner attribution on every service account",
        "An updated AD export only",
        "An interview confirming the IT lead is aware of the issue"
      ],
      "correctIndex": 1,
      "explanation": "Procedure + evidence-of-execution + corrected technical state together close the practice. Policy alone is insufficient; technical correction without documented procedure is fragile."
    },
    {
      "prompt": "Type the assessment method (one of: examine, interview, test) that produces the AD export evidence.",
      "acceptedAnswers": ["examine", "Examine"],
      "explanation": "Examine = review of documents, records, configurations. Interview = discussion with personnel. Test = direct exercise of the control."
    },
    {
      "prompt": "If the OSC enters into a POA&M to address the AC.L2-3.1.1 gap, what is the MAXIMUM duration the POA&M may remain open under the CMMC final rule for Level 2?",
      "options": ["30 days", "90 days", "180 days", "1 year"],
      "correctIndex": 2,
      "explanation": "CMMC's final rule allows Level 2 conditional certification with a POA&M closing within 180 days, only for limited practices and with risk-acceptable score impacts."
    }
  ]
}

❌ FANTASY LEAK — NEVER: assessment scenarios must read like real contractor evidence reviews, not D&D vignettes.

${SHARED_SCHEMA}

${SHARED_STYLE_RULES}

${SHARED_FOOTER}`;
```

- [ ] **Step 4: Wire CMMC into the index**

Edit `dungeon-scholar/src/prompts/index.js` — insert CMMC after Cisco alphabetically:

```js
import { AWS_PROMPT, AWS_PROMPT_META } from './aws.js';
import { CISCO_PROMPT, CISCO_PROMPT_META } from './cisco.js';
import { CMMC_PROMPT, CMMC_PROMPT_META } from './cmmc.js';
import { COMPTIA_PROMPT, COMPTIA_PROMPT_META } from './comptia.js';

export const ORG_PROMPTS = [
  { ...AWS_PROMPT_META, prompt: AWS_PROMPT },
  { ...CISCO_PROMPT_META, prompt: CISCO_PROMPT },
  { ...CMMC_PROMPT_META, prompt: CMMC_PROMPT },
  { ...COMPTIA_PROMPT_META, prompt: COMPTIA_PROMPT },
];
```

- [ ] **Step 5: Run tests**

Run: `cd dungeon-scholar && npm test -- prompts/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/home-lab
git add dungeon-scholar/src/prompts/cmmc.js dungeon-scholar/src/prompts/index.js dungeon-scholar/src/prompts/index.test.js
git commit -m "feat(dungeon-scholar): CMMC tome-creation prompt

Evidence-driven, framework-mapped (NIST 800-171/172) prompt covering
14 domains and Levels 1-3. Scenario stems present OSC artifacts and
assessor observations; lab walks through scoring an AC evidence package
with assessment-method (examine/interview/test) determination."
```

---

## Task 7: Create EC-Council prompt

**Files:**
- Create: `dungeon-scholar/src/prompts/eccouncil.js`
- Modify: `dungeon-scholar/src/prompts/index.js`
- Modify: `dungeon-scholar/src/prompts/index.test.js`

- [ ] **Step 1: Append failing tests**

```js
describe('EC-Council prompt', () => {
  it('is registered with id="eccouncil" and lists CEH', () => {
    const e = ORG_PROMPTS.find(p => p.id === 'eccouncil');
    expect(e).toBeDefined();
    expect(e.commonExams.some(x => x.includes('CEH'))).toBe(true);
  });
  it('mentions kill chain and tools like nmap or Metasploit', () => {
    const e = ORG_PROMPTS.find(p => p.id === 'eccouncil');
    expect(e.prompt).toMatch(/kill[- ]chain|cyber kill chain/i);
    expect(e.prompt).toMatch(/nmap|Metasploit/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd dungeon-scholar && npm test -- prompts/index.test.js`
Expected: FAIL

- [ ] **Step 3: Create the EC-Council prompt file**

Create `dungeon-scholar/src/prompts/eccouncil.js`:

```js
import { SHARED_HEADER, SHARED_SCHEMA, SHARED_STYLE_RULES, SHARED_FOOTER } from './_shared.js';

export const ECCOUNCIL_PROMPT_META = {
  id: 'eccouncil',
  name: 'EC-Council',
  emoji: '🗡️',
  subtitle: 'CEH, CHFI, CND, CCISO',
  examTargetPlaceholder: 'e.g. CEH v13',
  commonExams: [
    'CEH v13',
    'CHFI v11 (Computer Hacking Forensic Investigator)',
    'CND (Certified Network Defender)',
    'CCISO',
    'CSCU',
    'CTIA (Threat Intelligence Analyst)',
    'ECSA',
  ],
};

export const ECCOUNCIL_PROMPT = `${SHARED_HEADER}

ORGANIZATION: EC-Council

EXAM TARGET: <leave blank to let me infer from materials>

=== ABOUT EC-COUNCIL EXAMS ===

EC-Council exams (CEH foremost) test offensive-security methodology and tooling. Items emphasize the cyber kill chain (Reconnaissance → Weaponization → Delivery → Exploitation → Installation → Command-and-Control → Actions on Objectives), MITRE ATT&CK tactics/techniques, and the specific tool you reach for at each phase. Distractors include alternate tools that work but at the wrong phase (Nmap during exfiltration), or tools that look right but have a different specialty (John the Ripper vs Hashcat vs Hydra).

CEH and CND lean on knowing what command/flag produces what observable output (e.g. \`nmap -sV\` vs \`-sC\` vs \`-O\`), what each Metasploit module category does (auxiliary vs exploit vs post), and how to interpret tool output snippets (Wireshark, Burp, Nikto, recon-ng, theHarvester).

=== COMMON EC-COUNCIL EXAMS ===

- CEH v13 (ethical hacker — broad offensive methodology and tooling)
- CHFI v11 (forensic investigator — disk imaging, memory analysis, chain of custody)
- CND (defender — detection, response, hardening from a defender's lens)
- CCISO (CISO-track — governance, finance, vendor)
- CTIA (threat intelligence analyst), ECSA, CSCU

=== BLUEPRINT STRUCTURE ===

CEH v13 has 20 modules organized roughly along the kill chain: Introduction, Footprinting/Recon, Network Scanning, Enumeration, Vulnerability Analysis, System Hacking, Malware, Sniffing, Social Engineering, DoS, Session Hijacking, Evading IDS/Firewalls/Honeypots, Hacking Web Servers, Hacking Web Applications, SQL Injection, Hacking Wireless, Hacking Mobile, IoT/OT Hacking, Cloud Computing, Cryptography. Group these into the kill-chain phases or ATT&CK tactics for the knowledge base.

Use \`=== Domain N: <Phase or Module> ===\` headers. Tag each item's \`objective\` with the module number or kill-chain phase.

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥80 flashcards (one per major tool + one per ATT&CK technique)
- ≥80 quiz questions
- ≥10 labs (tool-driven offensive scenarios)
- ≥5 flashcards, ≥5 quiz items, ≥1 lab per module/phase

=== STYLE GUIDANCE ===

Quiz stems must:
- Frame as a pentest engagement (engagement scoping, ROE, recon, exploitation, post-ex, reporting)
- Ask which tool, technique, or command BEST achieves the attacker's goal
- Include real tool flags, syntax, or output snippets

Distractor patterns EC-Council loves:
- Right phase, wrong tool (Nmap when the answer is Masscan for speed)
- Right tool, wrong flag (\`-sV\` when \`-sC\` runs default scripts)
- Active vs passive recon confusion (theHarvester vs Nmap)
- ATT&CK tactic vs technique confusion (Persistence vs Defense Evasion)

Lab/PBQ artifacts to embed:
- Nmap output (\`Starting Nmap...PORT STATE SERVICE VERSION\`)
- Wireshark display filters and packet hex
- Burp Suite Repeater requests
- Metasploit module options output
- Linux command output (\`whoami\`, \`uname -a\`, \`/etc/passwd\` excerpt)

=== EXEMPLARS ===

✅ GOOD flashcard:

{
  "id": "fc1",
  "front": "nmap -sS vs -sT vs -sU vs -sA — when to use each scan type",
  "back": "-sS (SYN/half-open): default for privileged users, fast, stealthy — does not complete the 3-way handshake. -sT (TCP connect): used when not running as root, completes full handshake (more visible). -sU (UDP scan): probes UDP ports; slow because UDP is connectionless. -sA (ACK scan): does NOT determine open/closed; differentiates filtered vs unfiltered ports — useful for firewall rule mapping.",
  "hint": "Stealth, completeness, protocol, and firewall reconnaissance — pick the scan that matches the goal.",
  "objective": "Module 3 — Scanning"
}

✅ GOOD multiple-choice quiz:

{
  "id": "q1",
  "type": "multiplechoice",
  "question": "During an authorized engagement, you have a foothold on an internal Windows host as a low-privileged domain user. Your goal is to enumerate Service Principal Names (SPNs) for accounts with weak Kerberos ticket-encryption settings, intending to perform a Kerberoasting attack offline. Which tool/command pair is MOST appropriate at this stage?",
  "options": [
    "nmap -p 88 --script krb5-enum-users <DC>",
    "GetUserSPNs.py from Impacket, then hashcat -m 13100",
    "Mimikatz sekurlsa::logonpasswords",
    "responder -I eth0"
  ],
  "correctIndex": 1,
  "explanation": "Kerberoasting requests TGS tickets for accounts with SPNs and cracks them offline. GetUserSPNs.py (or PowerView's Get-DomainUser -SPN) extracts the tickets; hashcat -m 13100 is the matching mode for Kerberos 5 TGS-REP RC4. Nmap's krb5-enum-users enumerates accounts but does not pull crackable tickets. Mimikatz dumps cached creds (different attack). Responder is for LLMNR/NBT-NS poisoning."
}

❌ BAD multiple-choice quiz:

{
  "id": "q_bad",
  "type": "multiplechoice",
  "question": "What does CEH stand for?",
  "options": ["Certified Ethical Hacker", "Cyber Engineer Hacker", "Critical Exploit Handler", "Computer Engineer Hacker"],
  "correctIndex": 0
}

Why this is bad: pure trivia, no scenario, no methodology. CEH does not write items this lazy.

✅ GOOD lab (offensive scenario):

{
  "id": "lab1",
  "title": "Pentest engagement: from external recon to internal foothold",
  "scenario": "You have signed a Rules of Engagement document for a black-box external pentest of acmecorp.com. The ROE permits all recon, scanning, and exploitation against acmecorp.com and its public IP range 203.0.113.0/24, but prohibits DoS and social engineering. You have 5 days. Below is the initial scope email and an excerpt from your reconnaissance output.",
  "objective": "Module 2-5 — Footprinting through Vulnerability Analysis",
  "steps": [
    {
      "prompt": "Which recon tool is BEST for passive enumeration of acmecorp.com email addresses and subdomains BEFORE you touch the target's infrastructure?",
      "options": ["nmap -sV -p- 203.0.113.0/24", "theHarvester -d acmecorp.com -b all", "msfconsole > use auxiliary/scanner/http/ssl_version", "nikto -h https://www.acmecorp.com"],
      "correctIndex": 1,
      "explanation": "theHarvester aggregates passive sources (search engines, certificate transparency, public datasets) without sending packets to the target. Nmap, Metasploit auxiliary, and Nikto all touch the target — appropriate later, not for initial passive recon."
    },
    {
      "prompt": "After passive recon, you run nmap and find 203.0.113.42 has tcp/443 open with TLS 1.0 only. Which Metasploit auxiliary module BEST verifies this finding?",
      "options": [
        "auxiliary/scanner/http/dir_scanner",
        "auxiliary/scanner/ssl/openssl_heartbleed",
        "auxiliary/scanner/ssl/ssl_version",
        "auxiliary/scanner/portscan/syn"
      ],
      "correctIndex": 2,
      "explanation": "ssl_version enumerates supported TLS/SSL versions and confirms TLS 1.0-only configuration. Heartbleed is a different CVE; dir_scanner is content discovery; syn is a port-scan repeat."
    },
    {
      "prompt": "Type the nmap NSE script flag that runs the default 'safe' script category against tcp/443 of 203.0.113.42.",
      "acceptedAnswers": ["-sC", "--script default", "--script=default"],
      "explanation": "-sC equals --script default. Default scripts are vetted as low-risk."
    },
    {
      "prompt": "You exploit a vulnerable web application and gain a www-data shell. To pivot to the database server on the internal /24 network, which technique BEST forwards your local traffic through the foothold?",
      "options": [
        "SSH local port forwarding from your workstation to the web server",
        "Metasploit autoroute + socks_proxy through the active session",
        "Reverse VPN tunnel using OpenVPN",
        "Setting up a rogue DHCP server on the foothold"
      ],
      "correctIndex": 1,
      "explanation": "Metasploit's autoroute + socks_proxy pivots traffic through the existing session into the internal network. SSH local forwarding requires SSH access on the web server. Reverse VPN is heavy and detectable; rogue DHCP is unrelated."
    }
  ]
}

❌ FANTASY LEAK — NEVER: pentest scenarios stay in real engagement language.

${SHARED_SCHEMA}

${SHARED_STYLE_RULES}

${SHARED_FOOTER}`;
```

- [ ] **Step 4: Wire EC-Council into the index**

Edit `dungeon-scholar/src/prompts/index.js`:

```js
import { AWS_PROMPT, AWS_PROMPT_META } from './aws.js';
import { CISCO_PROMPT, CISCO_PROMPT_META } from './cisco.js';
import { CMMC_PROMPT, CMMC_PROMPT_META } from './cmmc.js';
import { COMPTIA_PROMPT, COMPTIA_PROMPT_META } from './comptia.js';
import { ECCOUNCIL_PROMPT, ECCOUNCIL_PROMPT_META } from './eccouncil.js';

export const ORG_PROMPTS = [
  { ...AWS_PROMPT_META, prompt: AWS_PROMPT },
  { ...CISCO_PROMPT_META, prompt: CISCO_PROMPT },
  { ...CMMC_PROMPT_META, prompt: CMMC_PROMPT },
  { ...COMPTIA_PROMPT_META, prompt: COMPTIA_PROMPT },
  { ...ECCOUNCIL_PROMPT_META, prompt: ECCOUNCIL_PROMPT },
];
```

- [ ] **Step 5: Run tests**

Run: `cd dungeon-scholar && npm test -- prompts/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/home-lab
git add dungeon-scholar/src/prompts/eccouncil.js dungeon-scholar/src/prompts/index.js dungeon-scholar/src/prompts/index.test.js
git commit -m "feat(dungeon-scholar): EC-Council tome-creation prompt

Offensive-methodology + tool-driven prompt covering CEH/CND/CHFI. Quiz
stems frame as pentest engagement scenarios; labs walk recon → exploit
→ pivot with real tool flags (nmap -sC, GetUserSPNs.py, hashcat -m 13100,
Metasploit autoroute). Distractors lean on phase/tool mismatches."
```

---

## Task 8: Create GIAC prompt

**Files:**
- Create: `dungeon-scholar/src/prompts/giac.js`
- Modify: `dungeon-scholar/src/prompts/index.js`
- Modify: `dungeon-scholar/src/prompts/index.test.js`

- [ ] **Step 1: Append failing tests**

```js
describe('GIAC prompt', () => {
  it('is registered with id="giac" and lists GSEC + GCIH', () => {
    const g = ORG_PROMPTS.find(p => p.id === 'giac');
    expect(g).toBeDefined();
    expect(g.commonExams).toContain('GSEC');
    expect(g.commonExams).toContain('GCIH');
  });
  it('mentions open-book and tool output', () => {
    const g = ORG_PROMPTS.find(p => p.id === 'giac');
    expect(g.prompt).toMatch(/open[- ]book/i);
    expect(g.prompt).toMatch(/Wireshark|Volatility|Sysmon/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd dungeon-scholar && npm test -- prompts/index.test.js`
Expected: FAIL

- [ ] **Step 3: Create the GIAC prompt file**

Create `dungeon-scholar/src/prompts/giac.js`:

```js
import { SHARED_HEADER, SHARED_SCHEMA, SHARED_STYLE_RULES, SHARED_FOOTER } from './_shared.js';

export const GIAC_PROMPT_META = {
  id: 'giac',
  name: 'GIAC',
  emoji: '⚜️',
  subtitle: 'GSEC, GCIH, GPEN, GCFA, GREM',
  examTargetPlaceholder: 'e.g. GCIH',
  commonExams: [
    'GSEC',
    'GCIH',
    'GPEN',
    'GCFA',
    'GCFE',
    'GREM',
    'GWAPT',
    'GMON',
    'GCIA',
    'GMOB',
    'GCED',
    'GICSP',
    'GCCC',
  ],
};

export const GIAC_PROMPT = `${SHARED_HEADER}

ORGANIZATION: GIAC (Global Information Assurance Certification — SANS-affiliated)

EXAM TARGET: <leave blank to let me infer from materials>

=== ABOUT GIAC EXAMS ===

GIAC exams are open-book: candidates carry indexed printed notes into the exam, and items are designed to test deep, applied technical knowledge that is hard to memorize but easy to reference if your notes are well-organized. Items frequently present a tool output snippet (Wireshark display, Volatility plugin output, Sysmon Event ID 1, Snort alert, packet hex) and ask what the candidate observes, what attack stage it represents, or what the next investigation step is. Calculation-style items (subnet math, CVSS, hash math) appear regularly.

Distractors lean on close-but-wrong tool output interpretation, off-by-one packet field offsets, and adjacent-but-distinct ATT&CK techniques.

=== COMMON GIAC EXAMS ===

- GSEC (broad foundational security)
- GCIH (incident handler — focus of SEC504)
- GPEN (pentester — SEC560)
- GCFA / GCFE (forensic analyst / examiner — FOR508 / FOR500)
- GREM (reverse engineer malware — FOR610)
- GWAPT (web app pentester — SEC542)
- GMON (continuous monitoring — SEC511)
- GCIA (intrusion analyst — SEC503)
- GMOB, GCED, GICSP (industrial control systems), GCCC

=== BLUEPRINT STRUCTURE ===

GIAC blueprints are SANS-course-aligned. GCIH covers: Incident Handling Process, Reconnaissance, Scanning, Exploitation, Lateral Movement, Persistence, Covering Tracks, Cryptanalysis, ATT&CK Mapping. GCIA covers: Packet Analysis, Wireshark, Snort, Network Forensics, IDS Tuning, Anomaly Detection. Use the EXAM TARGET's actual blueprint sections for domain headers.

Use \`=== Domain N: <Phase or SANS course module> ===\` headers. Tag each item's \`objective\` with the blueprint section.

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥80 flashcards
- ≥120 quiz questions (GIAC's open-book format pushes deep coverage; more items = better index practice)
- ≥10 labs (tool-output interpretation scenarios)
- ≥5 flashcards, ≥5 quiz items, ≥1 lab per blueprint section
- Embed real tool output prominently — GIAC notes are organized around tool outputs

=== STYLE GUIDANCE ===

Quiz stems must:
- Often present a tool output, packet hex, log line, or memory artifact
- Ask "what does this output indicate?", "what is the attacker's next step?", "which signature would detect this?"
- Include calculation items (subnet math, CVSS scoring, hash collision probability, password-cracking time estimates)

Distractor patterns GIAC loves:
- Close-but-wrong tool output interpretation
- Adjacent ATT&CK techniques (T1003.001 vs T1003.003)
- Off-by-one packet field offset
- Right tool, wrong plugin (Volatility \`pslist\` vs \`psscan\` vs \`pstree\`)

Lab/PBQ artifacts to embed:
- Wireshark display rows or packet hex
- Volatility plugin output (pslist, malfind, netscan, dlllist)
- Sysmon Event IDs (1 ProcessCreate, 3 NetworkConnect, 7 ImageLoad, 11 FileCreate)
- Snort/Suricata alert text
- PowerShell transcript fragments

=== EXEMPLARS ===

✅ GOOD flashcard:

{
  "id": "fc1",
  "front": "Volatility plugin: pslist vs psscan vs pstree — when does each find a process?",
  "back": "pslist: walks the doubly-linked _EPROCESS list (PsActiveProcessHead). Misses processes hidden by direct kernel object manipulation (DKOM unlinking). psscan: scans physical memory for _EPROCESS pool tags — catches DKOM-unlinked and recently-terminated processes. pstree: shows the parent-child tree from pslist data — useful for spotting suspicious parent-child relationships (e.g. winword.exe spawning powershell.exe). Run all three; compare output to find rootkit-hidden processes.",
  "hint": "List walk vs pool scan vs hierarchy — three different views of the process landscape.",
  "objective": "Memory Forensics"
}

✅ GOOD multiple-choice quiz:

{
  "id": "q1",
  "type": "multiplechoice",
  "question": "You are reviewing Sysmon logs from a suspected-compromised workstation. Event ID 1 (ProcessCreate) shows: ParentImage=C:\\\\Program Files\\\\Microsoft Office\\\\WINWORD.EXE spawning Image=C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe with CommandLine='-NoP -W Hidden -Enc <base64>'. What is the MOST likely attacker stage represented by this event?",
  "options": [
    "T1190 — Exploit Public-Facing Application",
    "T1059.001 — Command and Scripting Interpreter: PowerShell, triggered via T1566.001 phishing macro",
    "T1078 — Valid Accounts",
    "T1003.001 — LSASS Memory dumping"
  ],
  "correctIndex": 1,
  "explanation": "Office (WINWORD) spawning PowerShell with -NoP -W Hidden -Enc is a textbook macro-delivered execution (T1566.001 → T1059.001). The encoded command (-Enc) and hidden window (-W Hidden) signal evasion intent. T1190 is initial access via web-app exploit (different vector); T1078 is credential abuse without an exec event; T1003.001 would show lsass.exe in the parent or target image, not WINWORD."
}

❌ BAD multiple-choice quiz:

{
  "id": "q_bad",
  "type": "multiplechoice",
  "question": "What does GIAC stand for?",
  "options": ["Global Information Assurance Certification", "General Intelligence Access Center", "Graduate IT Analyst Council", "Global IT Assessment Council"],
  "correctIndex": 0
}

Why this is bad: trivia, no scenario, no tool output. GIAC tests applied analysis.

✅ GOOD lab (tool-output investigation):

{
  "id": "lab1",
  "title": "Triage suspicious memory artifacts from a possibly-compromised endpoint",
  "scenario": "An EDR alert flagged a finance-department workstation. You captured a memory image with WinPmem and are running Volatility 3 against it. Initial output: vol -f mem.raw windows.pslist shows winword.exe (PID 4532) → powershell.exe (PID 5104) → conhost.exe (PID 5120). Network connections: vol windows.netscan shows powershell.exe with established TCP connection to 185.220.101.42:443.",
  "objective": "Memory Forensics + ATT&CK Mapping",
  "steps": [
    {
      "prompt": "Which Volatility 3 plugin would BEST extract the full PowerShell command line that was executed?",
      "options": ["windows.pslist", "windows.cmdline", "windows.netscan", "windows.malfind"],
      "correctIndex": 1,
      "explanation": "windows.cmdline parses _PEB.ProcessParameters.CommandLine for each process — exactly what we need to see the PowerShell args."
    },
    {
      "prompt": "windows.cmdline reveals: powershell.exe -NoP -W Hidden -Enc JABjAGwAaQBlAG4AdAA9AE4AZQB3AC0ATwBiAGoAZQBjAHQAIABTAHkAcwB0AGUAbQAuAE4AZQB0AC4AUwBvAGMAawBlAHQAcwAuAFQAQwBQAEMAbABpAGUAbgB0AA== (truncated). Type the PowerShell flag whose presence strongly suggests obfuscated/evasive payload delivery.",
      "acceptedAnswers": ["-Enc", "-EncodedCommand", "-enc"],
      "explanation": "-Enc / -EncodedCommand passes a base64-encoded UTF-16LE string to PowerShell. Common evasion of command-line logging that does not decode the parameter."
    },
    {
      "prompt": "Decoding the base64 reveals 'New-Object System.Net.Sockets.TCPClient' — a reverse-shell idiom. Which ATT&CK technique BEST classifies this stage?",
      "options": [
        "T1071.001 — Application Layer Protocol: Web Protocols",
        "T1059.001 — Command and Scripting Interpreter: PowerShell",
        "T1571 — Non-Standard Port",
        "T1095 — Non-Application Layer Protocol"
      ],
      "correctIndex": 1,
      "explanation": "T1059.001 (PowerShell scripting) is the execution technique. T1071.001 covers the C2 channel itself (which is also present), but the question asks about the stage represented by the powershell.exe execution. In real ATT&CK mapping, you would map both."
    },
    {
      "prompt": "Which Volatility 3 plugin BEST identifies injected code regions inside running processes (e.g. injected shellcode)?",
      "options": ["windows.pslist", "windows.malfind", "windows.dlllist", "windows.handles"],
      "correctIndex": 1,
      "explanation": "windows.malfind scans memory for executable, RWX, or non-mapped regions inside processes — the classic indicator of code injection."
    }
  ]
}

❌ FANTASY LEAK — NEVER: tool-output analysis must read like a SOC analyst's notes, not a bard's tale.

${SHARED_SCHEMA}

${SHARED_STYLE_RULES}

${SHARED_FOOTER}`;
```

- [ ] **Step 4: Wire GIAC into the index**

Edit `dungeon-scholar/src/prompts/index.js`:

```js
import { AWS_PROMPT, AWS_PROMPT_META } from './aws.js';
import { CISCO_PROMPT, CISCO_PROMPT_META } from './cisco.js';
import { CMMC_PROMPT, CMMC_PROMPT_META } from './cmmc.js';
import { COMPTIA_PROMPT, COMPTIA_PROMPT_META } from './comptia.js';
import { ECCOUNCIL_PROMPT, ECCOUNCIL_PROMPT_META } from './eccouncil.js';
import { GIAC_PROMPT, GIAC_PROMPT_META } from './giac.js';

export const ORG_PROMPTS = [
  { ...AWS_PROMPT_META, prompt: AWS_PROMPT },
  { ...CISCO_PROMPT_META, prompt: CISCO_PROMPT },
  { ...CMMC_PROMPT_META, prompt: CMMC_PROMPT },
  { ...COMPTIA_PROMPT_META, prompt: COMPTIA_PROMPT },
  { ...ECCOUNCIL_PROMPT_META, prompt: ECCOUNCIL_PROMPT },
  { ...GIAC_PROMPT_META, prompt: GIAC_PROMPT },
];
```

- [ ] **Step 5: Run tests**

Run: `cd dungeon-scholar && npm test -- prompts/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/home-lab
git add dungeon-scholar/src/prompts/giac.js dungeon-scholar/src/prompts/index.js dungeon-scholar/src/prompts/index.test.js
git commit -m "feat(dungeon-scholar): GIAC tome-creation prompt

Open-book technical depth + tool-output interpretation: Volatility plugin
output, Sysmon Event IDs, ATT&CK technique mapping. Quiz volume bumped
to ≥120 to support GIAC's broad index-based exam style. Labs walk through
memory-forensics triage with windows.cmdline / windows.malfind / netscan."
```

---

## Task 9: Create Google prompt

**Files:**
- Create: `dungeon-scholar/src/prompts/google.js`
- Modify: `dungeon-scholar/src/prompts/index.js`
- Modify: `dungeon-scholar/src/prompts/index.test.js`

- [ ] **Step 1: Append failing tests**

```js
describe('Google prompt', () => {
  it('is registered with id="google" and lists Cloud Security Engineer', () => {
    const g = ORG_PROMPTS.find(p => p.id === 'google');
    expect(g).toBeDefined();
    expect(g.commonExams.some(e => e.includes('Cloud Security'))).toBe(true);
  });
  it('mentions GCP services like IAM, VPC SC, KMS', () => {
    const g = ORG_PROMPTS.find(p => p.id === 'google');
    expect(g.prompt).toMatch(/VPC SC|VPC Service Controls/);
    expect(g.prompt).toMatch(/Cloud KMS|Cloud IAM/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd dungeon-scholar && npm test -- prompts/index.test.js`
Expected: FAIL

- [ ] **Step 3: Create the Google prompt file**

Create `dungeon-scholar/src/prompts/google.js`:

```js
import { SHARED_HEADER, SHARED_SCHEMA, SHARED_STYLE_RULES, SHARED_FOOTER } from './_shared.js';

export const GOOGLE_PROMPT_META = {
  id: 'google',
  name: 'Google',
  emoji: '🌈',
  subtitle: 'Cloud Security Eng, Cloud Architect, Workspace Admin',
  examTargetPlaceholder: 'e.g. Professional Cloud Security Engineer',
  commonExams: [
    'Professional Cloud Security Engineer',
    'Professional Cloud Architect',
    'Cloud Digital Leader',
    'Professional Cloud Network Engineer',
    'Workspace Administrator',
    'Workspace Developer',
  ],
};

export const GOOGLE_PROMPT = `${SHARED_HEADER}

ORGANIZATION: Google Cloud

EXAM TARGET: <leave blank to let me infer from materials>

=== ABOUT GOOGLE CLOUD EXAMS ===

Google Cloud certifications use scenario-based MCs that describe a customer migration, security requirement, or architecture goal and ask which GCP services and configurations BEST satisfy it. Google rewards candidates who understand the GCP-specific primitives — IAM (identities, roles, service accounts, conditions), VPC and VPC Service Controls (perimeter security around Google APIs), Cloud KMS, Organization Policies, BeyondCorp/IAP — and can distinguish them from same-name competing-cloud concepts.

Distractors are typically other GCP services that almost fit, IAM role/scope confusion (predefined vs custom roles, basic vs predefined), or wrong perimeter (firewall rules vs VPC SC vs Org Policy).

=== COMMON GOOGLE CLOUD EXAMS ===

- Professional Cloud Security Engineer (deep IAM, VPC SC, KMS, encryption, BeyondCorp/IAP, SCC)
- Professional Cloud Architect (broad design)
- Cloud Digital Leader (foundational)
- Professional Cloud Network Engineer (VPC, hybrid connectivity, Cloud NAT)
- Workspace Administrator / Developer

=== BLUEPRINT STRUCTURE ===

Professional Cloud Security Engineer covers 6 domains: Configuring Access, Configuring Network Security, Ensuring Data Protection, Managing Operations, Ensuring Compliance, Configuring Secure Use of GCP Services. Use these or the EXAM TARGET's actual domains as KB headers.

Use \`=== Domain N: <Name> ===\` headers. Tag each item's \`objective\` with the domain or service area.

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥80 flashcards
- ≥80 quiz questions
- ≥8 labs (GCP service-config decisions)
- ≥5 flashcards, ≥5 quiz items, ≥1 lab per domain

=== STYLE GUIDANCE ===

Quiz stems must:
- Open with a customer/company scenario referencing Google Cloud workloads
- End with BEST/MOST secure/MOST scalable/MINIMUM operational overhead
- Force choices among adjacent GCP services or configurations

Distractor patterns Google loves:
- Predefined IAM role vs basic role vs custom role (overprivilege traps)
- VPC firewall rule vs VPC Service Controls vs Org Policy (perimeter confusion)
- Customer-managed encryption keys (CMEK) vs customer-supplied (CSEK) vs Google-managed
- Service account impersonation vs primary auth (when to use which)

Lab/PBQ artifacts to embed:
- gcloud CLI commands
- IAM policy bindings JSON
- VPC firewall rule definitions
- VPC Service Controls perimeter config
- Org Policy constraints (e.g. constraints/iam.disableServiceAccountKeyCreation)

=== EXEMPLARS ===

✅ GOOD flashcard:

{
  "id": "fc1",
  "front": "VPC Service Controls vs VPC firewall rules — what does each protect against?",
  "back": "VPC firewall rules: control L3/L4 traffic between VMs, networks, and IP ranges within a VPC. Stop network-layer attacks (e.g. unauthorized RDP access). VPC Service Controls (VPC SC): control access to Google managed APIs (Cloud Storage, BigQuery, KMS, etc.) from inside vs outside a defined service perimeter — even when a caller has valid IAM credentials. Stop credential-theft data exfiltration to external GCP projects. Use both: firewall rules for VM-layer, VPC SC for API-layer.",
  "hint": "L3/L4 vs Google API access — different layers, different threats.",
  "objective": "Domain 2 — Network Security"
}

✅ GOOD multiple-choice quiz:

{
  "id": "q1",
  "type": "multiplechoice",
  "question": "A regulated bank stores customer PII in BigQuery datasets within a single GCP project. The CISO requires that even users with valid IAM permissions cannot exfiltrate the data to a personal GCP project by running a BigQuery export job. Which GCP control is the MOST direct mitigation?",
  "options": [
    "Predefined IAM role bigquery.dataViewer instead of bigquery.dataEditor",
    "VPC firewall rule blocking outbound traffic on port 443",
    "VPC Service Controls perimeter enclosing the production project, with bigquery.googleapis.com in restricted services",
    "Org Policy constraints/iam.disableServiceAccountCreation"
  ],
  "correctIndex": 2,
  "explanation": "VPC Service Controls perimeters block API access to listed Google services from outside the perimeter, defeating IAM-credential-based exfiltration to a personal project. IAM role downgrade does not stop a privileged user. Firewall rules don't apply to Google API access (which is over Google's network). Org Policy on service accounts is a different control entirely."
}

❌ BAD multiple-choice quiz:

{
  "id": "q_bad",
  "type": "multiplechoice",
  "question": "What is GCP?",
  "options": ["Google Cloud Platform", "Generic Cloud Provider", "Google Compute Plus", "General Compute Platform"],
  "correctIndex": 0
}

Why this is bad: trivia, no scenario.

✅ GOOD lab (GCP service-config scenario):

{
  "id": "lab1",
  "title": "Lock down a regulated BigQuery analytics environment",
  "scenario": "A healthcare analytics team runs queries on de-identified PHI in a BigQuery dataset within project healthcare-analytics-prod. Compliance requires: (a) only specified analyst service accounts may query the dataset, (b) data may not leave the project boundary even via export, (c) all KMS decrypt operations must be auditable, (d) keys must use customer-managed material with 90-day rotation.",
  "objective": "Domain 3 — Data Protection",
  "steps": [
    {
      "prompt": "To meet requirement (b) — preventing data export to other GCP projects even with valid IAM — which control do you configure?",
      "options": [
        "IAM Conditions on bigquery.dataViewer",
        "VPC Service Controls perimeter on healthcare-analytics-prod with bigquery.googleapis.com restricted",
        "Org Policy constraints/storage.uniformBucketLevelAccess",
        "Cloud DLP redaction templates"
      ],
      "correctIndex": 1,
      "explanation": "VPC SC is the only GCP control that blocks API egress to other projects regardless of IAM."
    },
    {
      "prompt": "Type the gcloud command that creates a Cloud KMS keyring named 'hca-keys' in location us-central1.",
      "acceptedAnswers": [
        "gcloud kms keyrings create hca-keys --location us-central1",
        "gcloud kms keyrings create hca-keys --location=us-central1"
      ],
      "explanation": "Standard gcloud KMS keyring creation syntax."
    },
    {
      "prompt": "For requirement (d) — 90-day rotation on a customer-managed key — which approach is MOST aligned with GCP best practice?",
      "options": [
        "Manually rotate the key version every 90 days",
        "Set the key's --rotation-period=90d at creation; KMS rotates automatically",
        "Delete and recreate the key every 90 days",
        "Use Cloud Functions to call kms.cryptoKeys.update on a Cloud Scheduler trigger"
      ],
      "correctIndex": 1,
      "explanation": "Native KMS automatic rotation is the supported, audited approach. Manual or scripted rotation is error-prone and harder to demonstrate to auditors."
    },
    {
      "prompt": "An auditor asks how to prove no decrypt happened outside the perimeter. Which Cloud Audit Logs filter answers this?",
      "options": [
        "logName:cloudaudit.googleapis.com%2Fdata_access AND protoPayload.methodName:Decrypt AND NOT resource.labels.location=us-central1",
        "logName:cloudaudit.googleapis.com%2Fdata_access AND protoPayload.serviceName:cloudkms.googleapis.com AND protoPayload.methodName:Decrypt",
        "logName:cloudaudit.googleapis.com%2Factivity AND protoPayload.methodName:CreateKey",
        "logName:cloudaudit.googleapis.com%2Fsystem_event AND severity:ERROR"
      ],
      "correctIndex": 1,
      "explanation": "Cloud KMS Decrypt operations appear in Data Access audit logs with serviceName=cloudkms.googleapis.com and methodName=Decrypt. The Activity log is admin operations; system_event is system-generated."
    }
  ]
}

❌ FANTASY LEAK — NEVER: GCP scenarios stay in real cloud-architect language.

${SHARED_SCHEMA}

${SHARED_STYLE_RULES}

${SHARED_FOOTER}`;
```

- [ ] **Step 4: Wire Google into the index**

Edit `dungeon-scholar/src/prompts/index.js`:

```js
import { AWS_PROMPT, AWS_PROMPT_META } from './aws.js';
import { CISCO_PROMPT, CISCO_PROMPT_META } from './cisco.js';
import { CMMC_PROMPT, CMMC_PROMPT_META } from './cmmc.js';
import { COMPTIA_PROMPT, COMPTIA_PROMPT_META } from './comptia.js';
import { ECCOUNCIL_PROMPT, ECCOUNCIL_PROMPT_META } from './eccouncil.js';
import { GIAC_PROMPT, GIAC_PROMPT_META } from './giac.js';
import { GOOGLE_PROMPT, GOOGLE_PROMPT_META } from './google.js';

export const ORG_PROMPTS = [
  { ...AWS_PROMPT_META, prompt: AWS_PROMPT },
  { ...CISCO_PROMPT_META, prompt: CISCO_PROMPT },
  { ...CMMC_PROMPT_META, prompt: CMMC_PROMPT },
  { ...COMPTIA_PROMPT_META, prompt: COMPTIA_PROMPT },
  { ...ECCOUNCIL_PROMPT_META, prompt: ECCOUNCIL_PROMPT },
  { ...GIAC_PROMPT_META, prompt: GIAC_PROMPT },
  { ...GOOGLE_PROMPT_META, prompt: GOOGLE_PROMPT },
];
```

- [ ] **Step 5: Run tests**

Run: `cd dungeon-scholar && npm test -- prompts/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/home-lab
git add dungeon-scholar/src/prompts/google.js dungeon-scholar/src/prompts/index.js dungeon-scholar/src/prompts/index.test.js
git commit -m "feat(dungeon-scholar): Google Cloud tome-creation prompt

GCP-specific: IAM, VPC Service Controls, Cloud KMS, Org Policy. Scenario
stems force choices among adjacent GCP primitives (IAM role vs VPC SC
vs Org Policy); labs cover BigQuery + KMS + audit-log lockdown."
```

---

## Task 10: Create ISACA prompt

**Files:**
- Create: `dungeon-scholar/src/prompts/isaca.js`
- Modify: `dungeon-scholar/src/prompts/index.js`
- Modify: `dungeon-scholar/src/prompts/index.test.js`

- [ ] **Step 1: Append failing tests**

```js
describe('ISACA prompt', () => {
  it('is registered with id="isaca" and lists CISA + CISM', () => {
    const i = ORG_PROMPTS.find(p => p.id === 'isaca');
    expect(i).toBeDefined();
    expect(i.commonExams).toContain('CISA');
    expect(i.commonExams).toContain('CISM');
  });
  it('mentions audit and risk', () => {
    const i = ORG_PROMPTS.find(p => p.id === 'isaca');
    expect(i.prompt).toMatch(/audit/i);
    expect(i.prompt).toMatch(/risk/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd dungeon-scholar && npm test -- prompts/index.test.js`
Expected: FAIL

- [ ] **Step 3: Create the ISACA prompt file**

Create `dungeon-scholar/src/prompts/isaca.js`:

```js
import { SHARED_HEADER, SHARED_SCHEMA, SHARED_STYLE_RULES, SHARED_FOOTER } from './_shared.js';

export const ISACA_PROMPT_META = {
  id: 'isaca',
  name: 'ISACA',
  emoji: '🏺',
  subtitle: 'CISA, CISM, CRISC, CGEIT, CDPSE',
  examTargetPlaceholder: 'e.g. CISA',
  commonExams: ['CISA', 'CISM', 'CRISC', 'CGEIT', 'CDPSE'],
};

export const ISACA_PROMPT = `${SHARED_HEADER}

ORGANIZATION: ISACA

EXAM TARGET: <leave blank to let me infer from materials>

=== ABOUT ISACA EXAMS ===

ISACA exams (CISA, CISM, CRISC, CGEIT, CDPSE) test governance, audit, and risk-management thinking from the perspective of a senior practitioner who advises business leadership. Items frame audit findings, risk assessments, governance decisions, and ask what the auditor/manager should do BEST, FIRST, or PRIMARILY. The right answer often subordinates the technical fix to a process step (document the finding, communicate to management, update the risk register) — ISACA wants candidates who manage the engagement, not who reach for the keyboard.

Distractors are usually right-action-wrong-time (technical remediation when the question asks what the auditor reports first) or right-process-wrong-stakeholder (escalating to IT when the question is about board-level reporting).

=== COMMON ISACA EXAMS ===

- CISA — Certified Information Systems Auditor (audit process, IT operations, governance)
- CISM — Certified Information Security Manager (security program management)
- CRISC — Risk and Information Systems Control (risk identification, assessment, response, monitoring)
- CGEIT — Governance of Enterprise IT
- CDPSE — Data Privacy Solutions Engineer

=== BLUEPRINT STRUCTURE ===

CISA has 5 domains: Information System Auditing Process, Governance and Management of IT, Information Systems Acquisition/Development/Implementation, IS Operations and Business Resilience, Protection of Information Assets. CISM has 4 domains: Information Security Governance, Information Security Risk Management, Information Security Program, Incident Management. CRISC has 4 domains: Governance, IT Risk Assessment, Risk Response and Reporting, Information Technology and Security.

Use \`=== Domain N: <Name> ===\` headers. Tag each item's \`objective\` with the domain name.

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥80 flashcards
- ≥100 quiz questions (ISACA exams are heavily MC-driven)
- ≥6 labs (governance/audit vignettes — multi-stage with reporting/escalation steps)
- ≥5 flashcards, ≥5 quiz items, ≥1 lab per domain

=== STYLE GUIDANCE ===

Quiz stems must:
- Frame as an audit finding, risk assessment, governance decision, or board reporting situation
- End with BEST, MOST important, PRIMARY, FIRST, or NEXT
- Force the candidate to choose between technical fix vs process step vs reporting action

Distractor patterns ISACA loves:
- Technical remediation as the first action (when the answer is reporting/escalating)
- Right action, wrong stakeholder (audit committee vs IT vs management)
- Right action, wrong sequence (remediate before risk-assessing)
- Compliance-driven reasoning when business-impact is the better lens (and vice versa)

Lab/PBQ artifacts to embed:
- Audit working papers / control test results
- Risk register entries
- Findings memos
- Board/audit-committee briefing summaries
- COBIT, NIST CSF, ISO 27001, ISO 31000 references

=== EXEMPLARS ===

✅ GOOD flashcard:

{
  "id": "fc1",
  "front": "Inherent risk vs residual risk vs control risk — definitions and order",
  "back": "Inherent risk: risk before any controls — the natural exposure of the activity. Control risk: the risk that controls fail to detect/prevent the threat. Residual risk: risk remaining after controls operate as designed (residual = inherent reduced by control effectiveness). Risk-response decisions (accept/mitigate/transfer/avoid) are made against residual risk, not inherent. Audit opinions reflect control risk.",
  "hint": "Three risks form a chain: nature of activity → control failure → what's left.",
  "objective": "CISA Domain 5 / CRISC Domain 2"
}

✅ GOOD multiple-choice quiz:

{
  "id": "q1",
  "type": "multiplechoice",
  "question": "An IS auditor performing a follow-up review discovers that a previously-reported critical finding (privileged accounts without MFA) has not been remediated, and the original 90-day commitment passed three weeks ago. Management has not communicated any update. What should the auditor do FIRST?",
  "options": [
    "Recommend immediate enforcement of MFA on the privileged accounts",
    "Communicate the missed remediation date to the audit committee in the next scheduled report",
    "Discuss with management to understand the cause and revised timeline before escalating",
    "Add the finding to the next external auditor's information request"
  ],
  "correctIndex": 2,
  "explanation": "ISACA exam logic: the auditor's FIRST step on a missed commitment is to discuss with management — establish facts and understand cause before escalating. Direct technical remediation (option 1) is not the auditor's role. Audit-committee escalation (option 2) follows discussion if management cannot provide an acceptable revised timeline. Brave auditor, ask before you escalate."
}

❌ BAD multiple-choice quiz:

{
  "id": "q_bad",
  "type": "multiplechoice",
  "question": "What does CISA stand for?",
  "options": ["Certified Information Systems Auditor", "Certified IT Security Auditor", "Cyber Information Systems Analyst", "Certified Internal Security Auditor"],
  "correctIndex": 0
}

Why this is bad: trivia, no scenario, no governance reasoning.

✅ GOOD lab (audit/governance vignette):

{
  "id": "lab1",
  "title": "Respond to a misconfigured backup finding during a financial-system audit",
  "scenario": "You are the lead IS auditor on a financial-reporting application audit. During fieldwork your tester discovers that nightly database backups have been failing silently for 11 weeks — the backup agent is logging errors that no one monitors. The most recent successful backup is 78 days old. The application supports SOX-relevant general ledger transactions. Management has not been informed of the issue.",
  "objective": "CISA Domain 4 / CISM Domain 4",
  "steps": [
    {
      "prompt": "What is your FIRST action upon discovering the failed backups?",
      "options": [
        "Document the finding in the working papers and continue with planned testing",
        "Immediately notify the application owner and IT operations management to enable timely corrective action",
        "Issue a formal management letter",
        "Engage the external auditor to assess SOX impact"
      ],
      "correctIndex": 1,
      "explanation": "Critical findings discovered in fieldwork must be communicated to management promptly so corrective action can begin — even before the report is issued. Working-paper documentation is parallel, not first."
    },
    {
      "prompt": "How should this finding be classified in your audit report?",
      "options": [
        "Low — backups are an operational concern outside SOX scope",
        "Medium — affects availability but not data integrity",
        "High / Critical — directly threatens recoverability of SOX-relevant data and constitutes a deficiency in the change/operations control environment",
        "Informational — until management responds"
      ],
      "correctIndex": 2,
      "explanation": "78-day stale backups for a SOX-relevant general ledger system constitute a material control deficiency. Recoverability of financial data is a recovery/contingency control with direct SOX implications."
    },
    {
      "prompt": "Which COBIT domain BEST aligns with the failure (DSS04 Manage Continuity, BAI06 Manage Changes, MEA01 Monitor Performance, or DSS05 Manage Security Services)?",
      "options": ["DSS04 — Manage Continuity", "BAI06 — Manage Changes", "MEA01 — Monitor Performance and Conformance", "DSS05 — Manage Security Services"],
      "correctIndex": 0,
      "explanation": "DSS04 covers continuity/recovery — backups are a primary BCM control. The lack of monitoring (MEA01) is a related but secondary failure."
    },
    {
      "prompt": "Type the audit-report classification used to characterize a finding when management has not yet acted on the underlying control failure (acceptable answers include 'unresolved' or 'open').",
      "acceptedAnswers": ["unresolved", "open", "Open", "Unresolved", "outstanding"],
      "explanation": "ISACA terminology refers to findings as Open or Unresolved until management has implemented and the auditor has retested the corrective action."
    }
  ]
}

❌ FANTASY LEAK — NEVER: governance/audit scenarios must read like real audit working papers.

${SHARED_SCHEMA}

${SHARED_STYLE_RULES}

${SHARED_FOOTER}`;
```

- [ ] **Step 4: Wire ISACA into the index**

Edit `dungeon-scholar/src/prompts/index.js`:

```js
import { AWS_PROMPT, AWS_PROMPT_META } from './aws.js';
import { CISCO_PROMPT, CISCO_PROMPT_META } from './cisco.js';
import { CMMC_PROMPT, CMMC_PROMPT_META } from './cmmc.js';
import { COMPTIA_PROMPT, COMPTIA_PROMPT_META } from './comptia.js';
import { ECCOUNCIL_PROMPT, ECCOUNCIL_PROMPT_META } from './eccouncil.js';
import { GIAC_PROMPT, GIAC_PROMPT_META } from './giac.js';
import { GOOGLE_PROMPT, GOOGLE_PROMPT_META } from './google.js';
import { ISACA_PROMPT, ISACA_PROMPT_META } from './isaca.js';

export const ORG_PROMPTS = [
  { ...AWS_PROMPT_META, prompt: AWS_PROMPT },
  { ...CISCO_PROMPT_META, prompt: CISCO_PROMPT },
  { ...CMMC_PROMPT_META, prompt: CMMC_PROMPT },
  { ...COMPTIA_PROMPT_META, prompt: COMPTIA_PROMPT },
  { ...ECCOUNCIL_PROMPT_META, prompt: ECCOUNCIL_PROMPT },
  { ...GIAC_PROMPT_META, prompt: GIAC_PROMPT },
  { ...GOOGLE_PROMPT_META, prompt: GOOGLE_PROMPT },
  { ...ISACA_PROMPT_META, prompt: ISACA_PROMPT },
];
```

- [ ] **Step 5: Run tests**

Run: `cd dungeon-scholar && npm test -- prompts/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/home-lab
git add dungeon-scholar/src/prompts/isaca.js dungeon-scholar/src/prompts/index.js dungeon-scholar/src/prompts/index.test.js
git commit -m "feat(dungeon-scholar): ISACA tome-creation prompt

Audit + governance + risk lens (CISA/CISM/CRISC). Quiz stems frame
audit findings and risk decisions; right answer subordinates technical
fix to process step (discuss with management → escalate → report).
Labs walk through audit-finding triage with COBIT mapping."
```

---

## Task 11: Create (ISC)² prompt

**Files:**
- Create: `dungeon-scholar/src/prompts/isc2.js`
- Modify: `dungeon-scholar/src/prompts/index.js`
- Modify: `dungeon-scholar/src/prompts/index.test.js`

- [ ] **Step 1: Append failing tests**

```js
describe('(ISC)² prompt', () => {
  it('is registered with id="isc2" and lists CISSP', () => {
    const i = ORG_PROMPTS.find(p => p.id === 'isc2');
    expect(i).toBeDefined();
    expect(i.commonExams).toContain('CISSP');
  });
  it('mentions manager mindset and 8 domains', () => {
    const i = ORG_PROMPTS.find(p => p.id === 'isc2');
    expect(i.prompt).toMatch(/manager.{0,30}mindset|think like a manager/i);
    expect(i.prompt).toMatch(/8 domains|eight domains/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd dungeon-scholar && npm test -- prompts/index.test.js`
Expected: FAIL

- [ ] **Step 3: Create the (ISC)² prompt file**

Create `dungeon-scholar/src/prompts/isc2.js`:

```js
import { SHARED_HEADER, SHARED_SCHEMA, SHARED_STYLE_RULES, SHARED_FOOTER } from './_shared.js';

export const ISC2_PROMPT_META = {
  id: 'isc2',
  name: '(ISC)²',
  emoji: '🏛️',
  subtitle: 'CISSP, CCSP, SSCP, CSSLP',
  examTargetPlaceholder: 'e.g. CISSP',
  commonExams: ['CISSP', 'CCSP', 'SSCP', 'CSSLP', 'HCISPP', 'CGRC'],
};

export const ISC2_PROMPT = `${SHARED_HEADER}

ORGANIZATION: (ISC)²

EXAM TARGET: <leave blank to let me infer from materials>

=== ABOUT (ISC)² EXAMS ===

(ISC)² exams — CISSP foremost — test holistic security thinking from the manager's mindset. Items present a scenario and ask which choice is BEST, MOST effective, MOST important, or PRIMARY in protecting the organization. The "think like a manager" rule is famous: even technically-correct answers lose to answers that better reflect risk management, governance, business alignment, and process discipline. There are NO performance-based questions in real (ISC)² exams — items are MC and the recently-introduced "innovative" item types (drag-drop, hotspot) but no labs.

Distractors lean on technical-correct-but-managerially-wrong answers, single-control answers when defense-in-depth is better, or compliance-driven choices when risk-based reasoning is expected.

=== COMMON (ISC)² EXAMS ===

- CISSP (manager-track; 8 domains; ~125-175 questions adaptive)
- CCSP — Cloud Security Professional (CISSP + cloud focus)
- SSCP — Systems Security Practitioner (technician-track)
- CSSLP — Secure Software Lifecycle Professional
- HCISPP — Healthcare information security
- CGRC — Governance, Risk, Compliance (formerly CAP)

=== BLUEPRINT STRUCTURE ===

CISSP CBK has 8 domains: 1. Security and Risk Management, 2. Asset Security, 3. Security Architecture and Engineering, 4. Communication and Network Security, 5. Identity and Access Management (IAM), 6. Security Assessment and Testing, 7. Security Operations, 8. Software Development Security. CCSP has 6 domains. SSCP has 7 domains.

Use \`=== Domain N: <Name> ===\` headers. Tag each item's \`objective\` with the domain number/name.

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥80 flashcards
- ≥120 quiz questions (no PBQs in (ISC)² real exam — quiz volume compensates)
- ≥4 labs — frame these as multi-stage governance/architecture vignettes (NOT PBQs, since (ISC)² has none — but multi-step scenarios reinforce holistic reasoning)
- ≥5 flashcards, ≥5 quiz items per domain
- Cover the full CBK breadth — (ISC)² rewards holistic coverage over deep-in-one-domain

=== STYLE GUIDANCE ===

Quiz stems must:
- Frame at the management/architect level — what should the CISO, security manager, or architect choose?
- Use BEST, MOST, PRIMARY, FIRST, FIRST step of due diligence
- Force the candidate to subordinate technical accuracy to risk/governance/process

Distractor patterns (ISC)² loves:
- Technically-perfect single-control answer when defense-in-depth wins
- Compliance answer when risk-based reasoning is expected (or vice versa)
- "Implement X" when the question asks the FIRST management action (which is often "perform a risk assessment", "obtain executive approval", or "establish policy")
- Detective control when preventive is the goal (and vice versa)

Lab/PBQ-equivalent artifacts (multi-stage governance vignettes):
- Risk-management decision sequences (identify → assess → treat → monitor)
- Architecture trade-off discussions (CIA priorities, trust boundaries)
- Incident-response decision points (who is notified first, when does law enforcement enter?)
- Privacy-by-design choices

=== EXEMPLARS ===

✅ GOOD flashcard:

{
  "id": "fc1",
  "front": "Defense in depth — definition and (ISC)² 'manager mindset' application",
  "back": "Defense in depth: layered, redundant security controls so the failure of any single control does not result in a breach. (ISC)² applies it pervasively — when an item asks the BEST way to protect data, the answer that combines administrative + technical + physical controls usually beats a single technically-strong control. Manager-mindset reasoning: 'no single control is perfect; assume each layer can fail; design for survivability'.",
  "hint": "When two answers are technically correct, prefer the one that adds a layer rather than replacing one.",
  "objective": "Domain 1 — Security and Risk Management"
}

✅ GOOD multiple-choice quiz:

{
  "id": "q1",
  "type": "multiplechoice",
  "question": "An organization's CISO learns that a critical legacy application accepts user passwords transmitted in cleartext over its internal network. The application supports the finance department's monthly close process. The CISO must decide what to do. What is the BEST FIRST step?",
  "options": [
    "Direct IT operations to immediately disable the application until TLS is implemented",
    "Engage the application owner to perform a formal risk assessment, including business impact and compensating controls, before recommending action",
    "Implement TLS termination at the network layer to encrypt traffic transparently",
    "Document the issue as an exception in the risk register and revisit at the next quarterly review"
  ],
  "correctIndex": 1,
  "explanation": "(ISC)² manager mindset: the CISO does not unilaterally disable a finance-critical application (option 1 is reckless), nor implement a technical fix without business engagement (option 3), nor file-and-forget (option 4). The BEST first step is a risk assessment with the business owner so the response is informed by business impact and any compensating controls already in place. Brave architect, the manager's first move is always to gather evidence, not act."
}

❌ BAD multiple-choice quiz:

{
  "id": "q_bad",
  "type": "multiplechoice",
  "question": "What does CISSP stand for?",
  "options": ["Certified Information Systems Security Professional", "Cyber Information Security Specialist Professional", "Computer Information Systems Security Practitioner", "Certified IT Systems Security Pro"],
  "correctIndex": 0
}

Why this is bad: trivia, no manager-mindset reasoning.

✅ GOOD lab (governance vignette — multi-stage):

{
  "id": "lab1",
  "title": "Architect a privacy-by-design response to a new regulation",
  "scenario": "A new state-level privacy law (modeled on GDPR) takes effect in 18 months. It introduces: data-subject access rights (DSAR), 30-day breach notification, data-protection impact assessments (DPIA) for high-risk processing, and right to erasure. Your organization processes customer PII across 14 systems including an on-prem CRM, a cloud data warehouse, and three SaaS marketing tools. The General Counsel asks you, the security architect, to recommend a sequenced response.",
  "objective": "Domain 1 / Domain 2",
  "steps": [
    {
      "prompt": "Which activity should be the FIRST step in your response?",
      "options": [
        "Procure a DSAR fulfillment automation platform",
        "Conduct a data-flow inventory across all 14 systems and classify the PII processed in each",
        "Update privacy policy language on the website",
        "Implement encryption-at-rest on the cloud data warehouse"
      ],
      "correctIndex": 1,
      "explanation": "Privacy-by-design starts with knowing what you have and where it flows. Without a data inventory you cannot scope DSAR, breach notification, or DPIA work. Tooling, policy text, and technical controls follow inventory."
    },
    {
      "prompt": "After the inventory, which control area MOST directly enables the 30-day breach-notification requirement?",
      "options": [
        "Identity and access management",
        "Detection and response capability — log aggregation, alerting, and incident-response procedures",
        "Encryption-at-rest",
        "Data-loss prevention at the perimeter"
      ],
      "correctIndex": 1,
      "explanation": "30-day notification means you must DETECT the breach in time to investigate, scope, and notify. Detection/response is the control area that directly enables timely notification. The other options reduce breach probability or impact but do not enable detection."
    },
    {
      "prompt": "For the right-to-erasure requirement, which architectural pattern BEST minimizes long-term operational burden?",
      "options": [
        "Manual quarterly purges of historical records by the data team",
        "Centralized data catalog + erasure orchestration service that fans out delete requests to all 14 systems via APIs",
        "Encrypt all PII with per-user keys and 'delete' by destroying the user's key (crypto-shredding)",
        "Migrate all PII to a single SaaS platform with built-in erasure"
      ],
      "correctIndex": 1,
      "explanation": "Cataloged + orchestrated erasure scales across heterogeneous systems and produces an auditable trail. Manual purges fail at scale (option 1). Crypto-shredding works for some data but cannot satisfy 'right to erasure' alone in all jurisdictions (option 3). Migration is a decade-long initiative (option 4)."
    },
    {
      "prompt": "Which stakeholder MUST formally approve the program's risk-acceptance position before launch?",
      "options": [
        "CISO",
        "CIO",
        "Senior executive management or the Board, on advice of the General Counsel and CISO",
        "External auditor"
      ],
      "correctIndex": 2,
      "explanation": "(ISC)² manager mindset: privacy-program risk acceptance is an enterprise-level decision belonging to senior management or the Board, not a single executive. The CISO advises; the business accepts the risk."
    }
  ]
}

❌ FANTASY LEAK — NEVER: (ISC)² scenarios stay in real management language.

${SHARED_SCHEMA}

${SHARED_STYLE_RULES}

${SHARED_FOOTER}`;
```

- [ ] **Step 4: Wire (ISC)² into the index**

Edit `dungeon-scholar/src/prompts/index.js`:

```js
import { AWS_PROMPT, AWS_PROMPT_META } from './aws.js';
import { CISCO_PROMPT, CISCO_PROMPT_META } from './cisco.js';
import { CMMC_PROMPT, CMMC_PROMPT_META } from './cmmc.js';
import { COMPTIA_PROMPT, COMPTIA_PROMPT_META } from './comptia.js';
import { ECCOUNCIL_PROMPT, ECCOUNCIL_PROMPT_META } from './eccouncil.js';
import { GIAC_PROMPT, GIAC_PROMPT_META } from './giac.js';
import { GOOGLE_PROMPT, GOOGLE_PROMPT_META } from './google.js';
import { ISACA_PROMPT, ISACA_PROMPT_META } from './isaca.js';
import { ISC2_PROMPT, ISC2_PROMPT_META } from './isc2.js';

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
];
```

- [ ] **Step 5: Run tests**

Run: `cd dungeon-scholar && npm test -- prompts/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/home-lab
git add dungeon-scholar/src/prompts/isc2.js dungeon-scholar/src/prompts/index.js dungeon-scholar/src/prompts/index.test.js
git commit -m "feat(dungeon-scholar): (ISC)² tome-creation prompt

Manager-mindset across the 8-domain CBK. Quiz volume bumped to ≥120
(no PBQs in real (ISC)² exam). Distractors trap technically-perfect
but managerially-wrong answers; lab vignette walks privacy-by-design
program response with stakeholder-decision steps."
```

---

## Task 12: Create Microsoft prompt

**Files:**
- Create: `dungeon-scholar/src/prompts/microsoft.js`
- Modify: `dungeon-scholar/src/prompts/index.js`
- Modify: `dungeon-scholar/src/prompts/index.test.js`

- [ ] **Step 1: Append failing tests**

```js
describe('Microsoft prompt', () => {
  it('is registered with id="microsoft" and lists SC-200 + AZ-500', () => {
    const m = ORG_PROMPTS.find(p => p.id === 'microsoft');
    expect(m).toBeDefined();
    expect(m.commonExams).toContain('SC-200');
    expect(m.commonExams).toContain('AZ-500');
  });
  it('mentions KQL and Conditional Access', () => {
    const m = ORG_PROMPTS.find(p => p.id === 'microsoft');
    expect(m.prompt).toMatch(/KQL|Kusto/);
    expect(m.prompt).toMatch(/Conditional Access/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd dungeon-scholar && npm test -- prompts/index.test.js`
Expected: FAIL

- [ ] **Step 3: Create the Microsoft prompt file**

Create `dungeon-scholar/src/prompts/microsoft.js`:

```js
import { SHARED_HEADER, SHARED_SCHEMA, SHARED_STYLE_RULES, SHARED_FOOTER } from './_shared.js';

export const MICROSOFT_PROMPT_META = {
  id: 'microsoft',
  name: 'Microsoft',
  emoji: '🔷',
  subtitle: 'SC-100/200/300/400, AZ-500, MS-500',
  examTargetPlaceholder: 'e.g. SC-200',
  commonExams: ['SC-100', 'SC-200', 'SC-300', 'SC-400', 'AZ-500', 'MS-102', 'MD-102', 'AZ-104', 'AZ-305', 'AZ-700'],
};

export const MICROSOFT_PROMPT = `${SHARED_HEADER}

ORGANIZATION: Microsoft

EXAM TARGET: <leave blank to let me infer from materials>

=== ABOUT MICROSOFT EXAMS ===

Microsoft role-based exams test deep knowledge of the Azure / Microsoft 365 / Intune / Defender / Entra ecosystem from a specific job role's perspective. Items frequently present a customer scenario and ask which Microsoft service, configuration, or query BEST achieves the goal. SC-200 (Security Operations Analyst) heavily features KQL queries against Microsoft Sentinel, Defender XDR, and Microsoft 365 audit logs. SC-300 (Identity and Access Admin) emphasizes Entra ID Conditional Access policy design. AZ-500 (Azure Security Engineer) covers Azure-specific security primitives — NSGs, Azure Firewall, Key Vault, Defender for Cloud, Privileged Identity Management.

Distractors lean on adjacent Microsoft services (Defender for Endpoint vs Defender for Cloud vs Defender for Identity), wrong Conditional Access condition vs control, KQL operator confusion (where vs project vs summarize), or right-feature-wrong-license-tier.

=== COMMON MICROSOFT EXAMS ===

- SC-100 — Cybersecurity Architect Expert (architect-level, multi-product)
- SC-200 — Security Operations Analyst (Sentinel + Defender + KQL)
- SC-300 — Identity and Access Administrator (Entra ID, Conditional Access, PIM)
- SC-400 — Information Protection Administrator (Purview, DLP, sensitivity labels)
- AZ-500 — Azure Security Engineer
- MS-102 — Microsoft 365 Administrator, MD-102 — Endpoint Administrator
- AZ-104, AZ-305, AZ-700 — Azure admin/architect/network roles

=== BLUEPRINT STRUCTURE ===

Each role-based exam has its own blueprint. SC-200 has 4 domains: Mitigate threats using Microsoft 365 Defender, Mitigate threats using Defender for Cloud, Mitigate threats using Microsoft Sentinel, Mitigate threats using Microsoft Defender for Endpoint. SC-300: Implement identities, Implement authentication and access management, Implement access management for apps, Plan and implement identity governance.

Use \`=== Domain N: <Name> ===\` headers. Tag each item's \`objective\` with the domain or product area.

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥80 flashcards
- ≥80 quiz questions
- ≥10 labs (role-based scenarios — KQL queries for SC-200, Conditional Access for SC-300, NSG/Firewall for AZ-500)
- ≥5 flashcards, ≥5 quiz items, ≥1 lab per domain

=== STYLE GUIDANCE ===

Quiz stems must:
- Frame as a customer scenario with specific Microsoft products in scope
- End with BEST/MOST efficient/MOST secure
- Force choices among adjacent Microsoft services or configurations

Distractor patterns Microsoft loves:
- Defender for Endpoint vs Defender for Cloud vs Defender for Identity vs Defender for Office 365
- Conditional Access conditions vs grant controls vs session controls
- KQL operator confusion (where/project/extend/summarize/join)
- Wrong license-tier feature (Conditional Access requires Entra ID P1; PIM requires P2)
- Azure RBAC vs Entra ID roles (different scopes)

Lab/PBQ artifacts to embed:
- KQL query snippets (\`SecurityEvent | where EventID == 4625 | summarize count() by Account\`)
- Conditional Access policy JSON / blade screenshots described as text
- Defender for Endpoint custom detection rule
- Azure Resource Manager template fragments
- PowerShell / Azure CLI commands

=== EXEMPLARS ===

✅ GOOD flashcard:

{
  "id": "fc1",
  "front": "Conditional Access: 'Conditions' vs 'Grant controls' vs 'Session controls'",
  "back": "Conditions: WHO (users/groups), WHAT (apps), HOW (sign-in risk, user risk, device platform, locations, client apps). Grant controls: applied at sign-in — block, require MFA, require compliant device, require Hybrid AAD-joined, require approved client app, require app protection policy, require terms of use, require password change. Session controls: applied during the session — app-enforced restrictions, Conditional Access App Control (sign-in via Defender for Cloud Apps), persistent browser session, sign-in frequency, customize continuous-access-evaluation. Manager mindset: conditions describe the situation; grant/session describe the action.",
  "hint": "Three knobs: who/what/when (conditions), pass/fail at sign-in (grant), and during-session enforcement (session).",
  "objective": "SC-300 Domain 2"
}

✅ GOOD multiple-choice quiz:

{
  "id": "q1",
  "type": "multiplechoice",
  "question": "A SOC analyst using Microsoft Sentinel needs to find all sign-ins from impossible-travel pairs (two countries within 1 hour) for the past 7 days. Which Sentinel feature BEST surfaces this without writing custom KQL?",
  "options": [
    "A custom analytic rule with a KQL query joining SigninLogs to itself",
    "A built-in Anomalous sign-in risk detection from Microsoft Entra ID Protection, surfaced via the Microsoft Entra ID Protection connector",
    "A scheduled query that emails the analyst the SigninLogs CSV",
    "Manual review of the Audit Logs blade"
  ],
  "correctIndex": 1,
  "explanation": "Entra ID Protection includes 'atypical travel' / 'impossible travel' as a built-in risk detection. Connecting it to Sentinel surfaces those alerts without re-implementing the logic. Custom KQL is more work and reproduces what's already detected. CSV email and manual review are obviously inferior."
}

❌ BAD multiple-choice quiz:

{
  "id": "q_bad",
  "type": "multiplechoice",
  "question": "Which Microsoft product is for cloud security?",
  "options": ["Defender for Cloud", "Word", "Excel", "Teams"],
  "correctIndex": 0
}

Why this is bad: trivia, distractors are unrelated products. Microsoft exams test product distinction within the security family.

✅ GOOD lab (KQL + Conditional Access scenario):

{
  "id": "lab1",
  "title": "Investigate a suspected compromised admin account in Microsoft Sentinel",
  "scenario": "Microsoft Sentinel raised an Entra ID Protection alert: user admin@contoso.com had a high-risk sign-in from Russia at 03:14 UTC, followed 22 minutes later by a successful sign-in from California. The account is assigned the Global Administrator role. The account does NOT have phishing-resistant MFA — it uses SMS OTP. You need to investigate and contain.",
  "objective": "SC-200 / SC-300",
  "steps": [
    {
      "prompt": "Type the KQL query that returns all SigninLogs entries for admin@contoso.com in the last 24 hours, projecting time, country, IP, and result. Use the SigninLogs table.",
      "acceptedAnswers": [
        "SigninLogs | where UserPrincipalName == \\"admin@contoso.com\\" | where TimeGenerated > ago(24h) | project TimeGenerated, Location, IPAddress, ResultType",
        "SigninLogs | where UserPrincipalName == \\"admin@contoso.com\\" and TimeGenerated > ago(24h) | project TimeGenerated, Location, IPAddress, ResultType"
      ],
      "explanation": "Standard KQL: filter then project. Either where-and or chained where works."
    },
    {
      "prompt": "What is the FIRST containment action?",
      "options": [
        "Revoke all active refresh tokens for the user (revoke-mguserSign-ins or Entra portal)",
        "Send an email to the user asking if they recognize the sign-in",
        "Create a new Conditional Access policy",
        "Open a Defender for Endpoint live response session on the user's laptop"
      ],
      "correctIndex": 0,
      "explanation": "Revoking refresh tokens immediately invalidates any session the attacker has. Email asks waste time. New CA policy applies to future sign-ins, not the current one. Live response on the laptop is useful but not the FIRST step."
    },
    {
      "prompt": "After containment, you want to PREVENT recurrence. Which Conditional Access policy change BEST hardens this admin account?",
      "options": [
        "Require SMS-based MFA",
        "Block sign-ins from outside the United States",
        "Require phishing-resistant MFA (FIDO2 or Windows Hello for Business) for all Global Administrator sign-ins, with no SMS fallback",
        "Set sign-in frequency to 24 hours"
      ],
      "correctIndex": 2,
      "explanation": "SMS MFA is bypassable via SIM-swap and adversary-in-the-middle phishing. Phishing-resistant MFA (FIDO2) defeats credential theft + token-replay attacks. Geo-blocking is fragile (VPN bypass). Sign-in frequency reduces blast radius but does not prevent the initial compromise."
    },
    {
      "prompt": "For ongoing detection, which Defender for Cloud Apps capability BEST identifies similar token-replay attacks across all Entra ID users?",
      "options": [
        "Cloud Discovery Shadow IT report",
        "Anomaly Detection Policy 'Impossible travel'",
        "Information Protection Sensitivity labels",
        "App connector for Microsoft 365"
      ],
      "correctIndex": 1,
      "explanation": "Defender for Cloud Apps' Anomaly Detection Policies include Impossible Travel — a behavioral baseline that flags unfeasible geographic transitions. The other features serve different goals."
    }
  ]
}

❌ FANTASY LEAK — NEVER: investigation scenarios stay in real SOC analyst language.

${SHARED_SCHEMA}

${SHARED_STYLE_RULES}

${SHARED_FOOTER}`;
```

- [ ] **Step 4: Wire Microsoft into the index**

Edit `dungeon-scholar/src/prompts/index.js`:

```js
import { AWS_PROMPT, AWS_PROMPT_META } from './aws.js';
import { CISCO_PROMPT, CISCO_PROMPT_META } from './cisco.js';
import { CMMC_PROMPT, CMMC_PROMPT_META } from './cmmc.js';
import { COMPTIA_PROMPT, COMPTIA_PROMPT_META } from './comptia.js';
import { ECCOUNCIL_PROMPT, ECCOUNCIL_PROMPT_META } from './eccouncil.js';
import { GIAC_PROMPT, GIAC_PROMPT_META } from './giac.js';
import { GOOGLE_PROMPT, GOOGLE_PROMPT_META } from './google.js';
import { ISACA_PROMPT, ISACA_PROMPT_META } from './isaca.js';
import { ISC2_PROMPT, ISC2_PROMPT_META } from './isc2.js';
import { MICROSOFT_PROMPT, MICROSOFT_PROMPT_META } from './microsoft.js';

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
];
```

- [ ] **Step 5: Run tests**

Run: `cd dungeon-scholar && npm test -- prompts/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/home-lab
git add dungeon-scholar/src/prompts/microsoft.js dungeon-scholar/src/prompts/index.js dungeon-scholar/src/prompts/index.test.js
git commit -m "feat(dungeon-scholar): Microsoft tome-creation prompt

Role-based exam coverage (SC-100/200/300/400, AZ-500, MS/MD-102).
KQL queries, Conditional Access policies, Defender XDR + Sentinel.
Distractors use adjacent Defender products and license-tier traps."
```

---

## Task 13: Create Generic prompt

**Files:**
- Create: `dungeon-scholar/src/prompts/generic.js`
- Modify: `dungeon-scholar/src/prompts/index.js`
- Modify: `dungeon-scholar/src/prompts/index.test.js`

- [ ] **Step 1: Append failing tests**

```js
describe('Generic prompt', () => {
  it('is registered with id="generic" and lists no specific exams', () => {
    const g = ORG_PROMPTS.find(p => p.id === 'generic');
    expect(g).toBeDefined();
    expect(g.commonExams).toEqual([]);
  });
  it('mentions inferring style from EXAM TARGET or materials', () => {
    const g = ORG_PROMPTS.find(p => p.id === 'generic');
    expect(g.prompt).toMatch(/infer/i);
  });
});

describe('ORG_PROMPTS final shape', () => {
  it('has exactly 11 entries', () => {
    expect(ORG_PROMPTS).toHaveLength(11);
  });
  it('places Generic last in the picker order', () => {
    expect(ORG_PROMPTS[ORG_PROMPTS.length - 1].id).toBe('generic');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd dungeon-scholar && npm test -- prompts/index.test.js`
Expected: FAIL

- [ ] **Step 3: Create the Generic prompt file**

Create `dungeon-scholar/src/prompts/generic.js`:

```js
import { SHARED_HEADER, SHARED_SCHEMA, SHARED_STYLE_RULES, SHARED_FOOTER } from './_shared.js';

export const GENERIC_PROMPT_META = {
  id: 'generic',
  name: 'Generic',
  emoji: '📖',
  subtitle: 'Any cybersecurity exam or framework',
  examTargetPlaceholder: 'e.g. CompTIA Security+ SY0-701',
  commonExams: [],
};

export const GENERIC_PROMPT = `${SHARED_HEADER}

ORGANIZATION: Generic (any cybersecurity exam or framework)

EXAM TARGET: <leave blank to let me infer from materials>

=== ABOUT THIS PROMPT ===

This is the generic fallback when the user is preparing for a cybersecurity exam not covered by a dedicated organization prompt. Infer the exam style from the EXAM TARGET above (if provided) and from the structure/depth of the materials. If neither names a specific exam, default to a CompTIA-Security+-shaped output: scenario-based multiple-choice with BEST/MOST/FIRST qualifiers, plausible distractors, blueprint-organized knowledge base, and multi-stage labs that resemble Performance-Based Questions (PBQs).

=== STYLE INFERENCE GUIDE ===

When EXAM TARGET names or implies a recognized exam, adopt the appropriate org's style:

- CompTIA-style (Security+, CySA+, Pentest+, Network+): scenario MCs + PBQs with logs/configs/commands
- Cisco-style (CCNA, CCNP, CyberOps): IOS configs, show output, CLI commands, packet captures
- (ISC)²-style (CISSP, CCSP, SSCP): manager-mindset, holistic, no PBQs (use multi-stage governance vignettes)
- ISACA-style (CISA, CISM, CRISC): governance/audit/risk lens, process-over-tech
- GIAC-style (GSEC, GCIH, GPEN): open-book technical depth, tool-output interpretation
- AWS / Azure / GCP-style: service-scenario architecture decisions
- EC-Council-style (CEH, CHFI): offensive methodology + tools
- CMMC-style (Levels 1-3): control-assessment evidence
- Microsoft role-based (SC, AZ, MS): KQL, Conditional Access, product-family decisions

If the exam is not in this list (e.g. SANS courses outside GIAC, vendor-specific, regional certs, academic exams), choose the closest analogue and apply its style cues. State the inferred style in the metadata.description field so the user knows what you chose.

=== BLUEPRINT STRUCTURE ===

If the EXAM TARGET implies a recognized blueprint, use it. Otherwise, derive a blueprint by:
1. Reading the user's materials and identifying ~5-8 major topical sections
2. Naming them as Domain 1, Domain 2, etc.
3. Stating the inferred blueprint in metadata.description

Use \`=== Domain N: <Name> ===\` headers in the knowledge base. Tag each item's \`objective\` with your inferred domain name or number.

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥80 flashcards
- ≥80 quiz questions
- ≥8 labs (default to PBQ-style with realistic artifacts; for governance-flavored exams use multi-stage vignettes)
- ≥5 flashcards, ≥5 quiz items, ≥1 lab per inferred domain
- Scale up proportionally if material exceeds standard scope

=== STYLE GUIDANCE ===

Default to CompTIA-Security+ style unless inference suggests otherwise. Quiz stems ≥2 sentences, scenario-driven, ending in BEST/MOST/FIRST/PRIMARY/NEXT. Distractors must be plausible misconceptions. Bloom's mix: ~30% recall, ~50% applied, ~20% analysis.

Lab/PBQ artifacts: at minimum one realistic artifact per lab (log line, config snippet, command output, policy excerpt, audit finding). Choose artifacts that match the inferred exam's typical content.

=== EXEMPLARS ===

The same exemplars from CompTIA apply by default. If you infer a different style (e.g. CISSP-manager-mindset), adapt accordingly — the spirit is: scenario-driven stems, plausible distractors, multi-stage labs, exam-realistic technical content, mild fantasy permitted only in explanation/hint.

✅ Default GOOD scenario MC pattern:

{
  "id": "q1",
  "type": "multiplechoice",
  "question": "<Scenario stem ≥2 sentences setting an actor (analyst/admin/auditor/architect/engineer/user) in a real situation>. Which option BEST/MOST/FIRST achieves the goal?",
  "options": ["<Plausible distractor>", "<Correct answer>", "<Plausible distractor>", "<Plausible distractor>"],
  "correctIndex": 1,
  "explanation": "Why correct + why each distractor is wrong (mild fantasy flavor permitted).",
  "objective": "<inferred domain reference>"
}

❌ NEVER: pure recall, fantasy framing in technical fields, throwaway distractors.

${SHARED_SCHEMA}

${SHARED_STYLE_RULES}

${SHARED_FOOTER}`;
```

- [ ] **Step 4: Wire Generic into the index — placed LAST (per spec)**

Edit `dungeon-scholar/src/prompts/index.js`:

```js
import { AWS_PROMPT, AWS_PROMPT_META } from './aws.js';
import { CISCO_PROMPT, CISCO_PROMPT_META } from './cisco.js';
import { CMMC_PROMPT, CMMC_PROMPT_META } from './cmmc.js';
import { COMPTIA_PROMPT, COMPTIA_PROMPT_META } from './comptia.js';
import { ECCOUNCIL_PROMPT, ECCOUNCIL_PROMPT_META } from './eccouncil.js';
import { GENERIC_PROMPT, GENERIC_PROMPT_META } from './generic.js';
import { GIAC_PROMPT, GIAC_PROMPT_META } from './giac.js';
import { GOOGLE_PROMPT, GOOGLE_PROMPT_META } from './google.js';
import { ISACA_PROMPT, ISACA_PROMPT_META } from './isaca.js';
import { ISC2_PROMPT, ISC2_PROMPT_META } from './isc2.js';
import { MICROSOFT_PROMPT, MICROSOFT_PROMPT_META } from './microsoft.js';

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

- [ ] **Step 5: Run tests**

Run: `cd dungeon-scholar && npm test -- prompts/`
Expected: PASS — all 11 entries present, length=11, generic last

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/home-lab
git add dungeon-scholar/src/prompts/generic.js dungeon-scholar/src/prompts/index.js dungeon-scholar/src/prompts/index.test.js
git commit -m "feat(dungeon-scholar): Generic fallback tome-creation prompt

Default-to-CompTIA-Security+ style unless EXAM TARGET implies otherwise.
Placed last in ORG_PROMPTS picker order. Completes the 11-entry
prompt module."
```

---

## Task 14: Extract `PromptModal` from `App.jsx` as a faithful port

This is mechanical — move the existing modal code unchanged, then refactor in subsequent tasks. No behavior change in this commit; everything still works exactly as before.

**Files:**
- Create: `dungeon-scholar/src/components/PromptModal.jsx`
- Modify: `dungeon-scholar/src/App.jsx` (remove inline definition + add import)

- [ ] **Step 1: Create the components directory**

Run: `mkdir -p dungeon-scholar/src/components`
This is the first file under `src/components/` — the directory does not exist yet.

- [ ] **Step 2: Read the existing inline PromptModal**

Run: `grep -n "function PromptModal" dungeon-scholar/src/App.jsx`
Expected: one line printing the function definition. Note the line number — the block runs ~150 lines from there.

- [ ] **Step 3: Create the new file with the existing modal code**

Create `dungeon-scholar/src/components/PromptModal.jsx`:

```jsx
import { useState } from 'react';
import { Wand2, X, Check } from 'lucide-react';

export default function PromptModal({ onClose }) {
  const [copied, setCopied] = useState(false);
  const prompt = `You are creating a tome file for Dungeon Scholar, a fantasy-themed cybersecurity study app. I will provide study materials (notes, PDFs, slides, videos, transcripts). Generate a single JSON object with the following structure:

{
  "metadata": {
    "title": "Course Name",
    "description": "Brief description",
    "subject": "Cybersecurity",
    "author": "Optional — your name or source author",
    "difficulty": 3,
    "tags": ["cert-prep", "security-plus", "exam-2024"],
    "version": "1.0"
  },
  "knowledgeBase": "A comprehensive text reference covering all key concepts from the materials. Used by the Oracle (AI tutor) to answer student questions. Should be thorough.",
  "flashcards": [
    {
      "id": "fc1",
      "front": "Term or question",
      "back": "Definition or answer",
      "hint": "Optional hint"
    }
  ],
  "quiz": [
    {
      "id": "q1",
      "type": "multiplechoice",
      "question": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Why this is correct",
      "hint": "Optional hint"
    }
  ],
  "labs": [
    {
      "id": "lab1",
      "title": "Lab Title",
      "scenario": "Background context for the lab",
      "steps": [
        {
          "prompt": "Step instruction or question",
          "options": ["A", "B", "C"],
          "correctIndex": 1,
          "explanation": "Why"
        }
      ]
    }
  ]
}

REQUIREMENTS:
- Generate at least 50 flashcards, 50 quiz questions, and 5 labs
- Output ONLY the JSON, no markdown code fences, no commentary

Now wait for me to provide the study materials, then generate the tome file.`;

  const copy = () => {
    let success = false;
    try {
      const ta = document.createElement('textarea');
      ta.value = prompt;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        success = document.execCommand('copy');
      } catch (e) {
        success = false;
      }
      document.body.removeChild(ta);
    } catch (e) {
      success = false;
    }
    if (!success && navigator.clipboard) {
      navigator.clipboard.writeText(prompt).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
      return;
    }
    setCopied(success);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4">
      <div className="rounded max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col relative" style={{
        background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.97) 0%, rgba(10, 6, 4, 0.99) 100%)',
        border: '3px double rgba(245, 158, 11, 0.6)', boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
      }}>
        <div className="p-4 border-b border-amber-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-amber-300 flex items-center gap-2 italic">
            <Wand2 className="w-5 h-5" /> ✦ Spell of Tome Creation ✦
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-amber-900/30 rounded text-amber-300"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <p className="text-sm text-amber-100/80 mb-3 italic">"Speak this incantation to any AI familiar (Claude, ChatGPT, Gemini), then offer them your study materials. They shall forge a sacred tome you may import into the library."</p>
          <pre className="rounded p-4 text-xs whitespace-pre-wrap overflow-auto max-h-[50vh]" style={{ background: 'rgba(10, 6, 4, 0.7)', border: '1px solid rgba(120, 53, 15, 0.5)', color: '#fcd34d', fontFamily: 'monospace' }}>{prompt}</pre>
        </div>
        <div className="p-4 border-t border-amber-700/50 flex gap-2">
          <button onClick={copy} className="flex-1 py-3 font-bold rounded flex items-center justify-center gap-2 text-amber-950 border-2 border-amber-300 italic"
            style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)', boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)' }}>
            {copied ? <><Check className="w-4 h-4" /> Inscribed!</> : <>📜 Copy the Spell</>}
          </button>
        </div>
      </div>
    </div>
  );
}
```

(This file is intentionally a faithful port of the existing inline definition; behavior matches today exactly. It will be replaced wholesale in Task 15.)

- [ ] **Step 4: Delete the inline `PromptModal` definition from `App.jsx`**

Open `dungeon-scholar/src/App.jsx` and delete the entire `function PromptModal({ onClose }) { ... }` block (the line `function PromptModal({ onClose }) {` through the matching closing `}` ~150 lines later). Use the line number from Step 2 as a starting anchor; search for the function name rather than relying on absolute line numbers in case the file has shifted. Verify `function ChatMode...` ends just before the deletion start, and `function QuestBoard...` begins just after the deletion end.

- [ ] **Step 5: Add the import at the top of `App.jsx`**

Find the existing top-level imports in `App.jsx` (around lines 1-25). Add this import alongside them (preserve existing import-order convention):

```js
import PromptModal from './components/PromptModal.jsx';
```

- [ ] **Step 6: Verify build works and tests still pass**

Run:
```bash
cd dungeon-scholar
npm run build
npm test
```
Expected: Build succeeds with no errors. All existing tests pass (no test changes in this task).

- [ ] **Step 7: Smoke-test the dev server**

Run: `cd dungeon-scholar && npm run dev` (in a separate terminal)
Open `http://localhost:5173`, navigate the tutorial to the "Behold the Spell of Tome Creation" step, click the button, verify the modal opens and the existing prompt is displayed exactly as before. Click "Copy the Spell" and verify the clipboard contains the prompt. Close the dev server.

- [ ] **Step 8: Commit**

```bash
cd /home/patrick/home-lab
git add dungeon-scholar/src/components/PromptModal.jsx dungeon-scholar/src/App.jsx
git commit -m "refactor(dungeon-scholar): extract PromptModal to its own file

Mechanical port — no behavior change. Inline PromptModal definition
removed from App.jsx (-150 lines); src/components/PromptModal.jsx now
holds the existing modal exactly as before. Subsequent commit replaces
this file with the new two-step picker."
```

---

## Task 15: Replace `PromptModal` with the two-step state machine

**Files:**
- Modify (rewrite): `dungeon-scholar/src/components/PromptModal.jsx`

- [ ] **Step 1: Write the failing tests**

Create `dungeon-scholar/src/components/PromptModal.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PromptModal from './PromptModal.jsx';

describe('PromptModal — Step 1 org picker', () => {
  it('renders 11 org buttons and a close button', () => {
    render(<PromptModal onClose={() => {}} />);
    // Eleven org buttons (one per ORG_PROMPTS entry)
    expect(screen.getByRole('button', { name: /CompTIA/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cisco/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CMMC/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /AWS/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Microsoft/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generic/i })).toBeInTheDocument();
  });

  it('calls onClose when X button is clicked', () => {
    const onClose = vi.fn();
    render(<PromptModal onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('PromptModal — Step 2 prompt viewer', () => {
  it('clicking an org button transitions to Step 2 with the correct prompt visible', () => {
    render(<PromptModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /CompTIA/i }));
    // Step 2 shows the prompt body (look for the EXAM TARGET line)
    expect(screen.getByText(/EXAM TARGET:/)).toBeInTheDocument();
    // Step 2 has an exam-target input
    expect(screen.getByPlaceholderText(/Security\+ SY0-701/i)).toBeInTheDocument();
  });

  it('back arrow returns to Step 1 and clears the input', () => {
    render(<PromptModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /CompTIA/i }));
    const input = screen.getByPlaceholderText(/Security\+ SY0-701/i);
    fireEvent.change(input, { target: { value: 'Security+ SY0-701' } });
    expect(input.value).toBe('Security+ SY0-701');

    fireEvent.click(screen.getByLabelText(/back/i));
    // Back at Step 1 — pick CompTIA again, verify input is cleared
    fireEvent.click(screen.getByRole('button', { name: /CompTIA/i }));
    expect(screen.getByPlaceholderText(/Security\+ SY0-701/i).value).toBe('');
  });

  it('typing in the exam-target input updates the prompt preview', () => {
    render(<PromptModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /CompTIA/i }));
    const input = screen.getByPlaceholderText(/Security\+ SY0-701/i);
    fireEvent.change(input, { target: { value: 'Security+ SY0-701' } });
    // Prompt block should now contain the substituted line
    const prompt = screen.getByTestId('prompt-preview');
    expect(prompt.textContent).toMatch(/EXAM TARGET: Security\+ SY0-701/);
  });
});

describe('PromptModal — copy behavior', () => {
  beforeEach(() => {
    document.execCommand = vi.fn(() => true);
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    });
  });

  it('clicking copy with empty exam-target writes the prompt with the leave-blank placeholder', () => {
    const execSpy = vi.spyOn(document, 'execCommand');
    render(<PromptModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /CompTIA/i }));
    fireEvent.click(screen.getByRole('button', { name: /Copy the Spell/i }));
    expect(execSpy).toHaveBeenCalledWith('copy');
    // Verify the textarea selected for copy contained the leave-blank token
    // (the textarea is removed from DOM after copy; we assert via the rendered preview text)
    expect(screen.getByTestId('prompt-preview').textContent).toMatch(/EXAM TARGET: <leave blank/);
  });

  it('clicking copy with a filled exam-target writes the substituted prompt', () => {
    render(<PromptModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /CompTIA/i }));
    fireEvent.change(screen.getByPlaceholderText(/Security\+ SY0-701/i), {
      target: { value: 'CySA+ CS0-003' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Copy the Spell/i }));
    expect(screen.getByTestId('prompt-preview').textContent).toMatch(/EXAM TARGET: CySA\+ CS0-003/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dungeon-scholar && npm test -- components/PromptModal.test.jsx`
Expected: FAIL — current modal has only one button ("Copy the Spell") and no org picker.

- [ ] **Step 3: Rewrite `PromptModal.jsx`**

Replace the entire content of `dungeon-scholar/src/components/PromptModal.jsx`:

```jsx
import { useState, useMemo } from 'react';
import { Wand2, X, Check, ArrowLeft } from 'lucide-react';
import { ORG_PROMPTS } from '../prompts/index.js';

const EXAM_TARGET_LEAVE_BLANK = '<leave blank to let me infer from materials>';
const EXAM_TARGET_LINE_REGEX = /EXAM TARGET: <[^>]+>/;

function buildFinalPrompt(promptTemplate, examTarget) {
  const target = examTarget.trim() || EXAM_TARGET_LEAVE_BLANK;
  return promptTemplate.replace(EXAM_TARGET_LINE_REGEX, `EXAM TARGET: ${target}`);
}

function copyToClipboard(text) {
  let success = false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      success = document.execCommand('copy');
    } catch (e) {
      success = false;
    }
    document.body.removeChild(ta);
  } catch (e) {
    success = false;
  }
  if (!success && navigator.clipboard) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  return Promise.resolve(success);
}

const MODAL_SHELL_STYLE = {
  background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.97) 0%, rgba(10, 6, 4, 0.99) 100%)',
  border: '3px double rgba(245, 158, 11, 0.6)',
  boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
};

function ModalShell({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4">
      <div
        className="rounded max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col relative"
        style={MODAL_SHELL_STYLE}
      >
        {children}
      </div>
    </div>
  );
}

function OrgPicker({ orgs, onPick, onClose }) {
  return (
    <>
      <div className="p-4 border-b border-amber-700/50 flex justify-between items-center">
        <h3 className="text-xl font-bold text-amber-300 flex items-center gap-2 italic">
          <Wand2 className="w-5 h-5" /> ✦ Spell of Tome Creation ✦
        </h3>
        <button
          onClick={onClose}
          aria-label="close"
          className="p-2 hover:bg-amber-900/30 rounded text-amber-300"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-4 overflow-y-auto flex-1">
        <p className="text-sm text-amber-100/80 mb-4 italic">
          &ldquo;Choose the order whose exams thou wouldst conquer. Each holds a tome-forging spell tuned to its trials.&rdquo;
        </p>
        <div className="space-y-2">
          {orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => onPick(org.id)}
              className="w-full text-left p-3 rounded transition border-2 border-amber-700/50 hover:border-amber-400 hover:bg-amber-900/20 text-amber-100 italic"
              style={{ background: 'rgba(10, 6, 4, 0.5)' }}
            >
              <div className="font-bold flex items-center gap-2">
                <span className="text-2xl">{org.emoji}</span>
                <span className="text-amber-300">{org.name}</span>
              </div>
              <div className="text-xs text-amber-100/60 mt-1 ml-9">{org.subtitle}</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function PromptViewer({ org, examTarget, setExamTarget, finalPrompt, copied, onCopy, onBack, onClose }) {
  return (
    <>
      <div className="p-4 border-b border-amber-700/50 flex justify-between items-center">
        <button
          onClick={onBack}
          aria-label="back"
          className="p-2 hover:bg-amber-900/30 rounded text-amber-300"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h3 className="text-xl font-bold text-amber-300 flex items-center gap-2 italic">
          <span className="text-2xl">{org.emoji}</span>
          ✦ {org.name} Tome Spell ✦
        </h3>
        <button
          onClick={onClose}
          aria-label="close"
          className="p-2 hover:bg-amber-900/30 rounded text-amber-300"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-4 overflow-y-auto flex-1">
        <label className="block mb-3">
          <span className="text-xs text-amber-300 italic block mb-1">
            ✦ Name thy chosen trial — Exam Target (optional)
          </span>
          <input
            type="text"
            value={examTarget}
            onChange={(e) => setExamTarget(e.target.value)}
            placeholder={org.examTargetPlaceholder}
            maxLength={250}
            className="w-full p-2 rounded border-2 focus:outline-none italic text-amber-50"
            style={{ background: 'rgba(10, 6, 4, 0.7)', borderColor: 'rgba(120, 53, 15, 0.7)' }}
          />
        </label>
        <p className="text-xs text-amber-100/70 mb-2 italic">
          &ldquo;Speak this incantation to any AI familiar (Claude, ChatGPT, Gemini), then offer them your study materials.&rdquo;
        </p>
        <pre
          data-testid="prompt-preview"
          className="rounded p-4 text-xs whitespace-pre-wrap overflow-auto max-h-[40vh]"
          style={{
            background: 'rgba(10, 6, 4, 0.7)',
            border: '1px solid rgba(120, 53, 15, 0.5)',
            color: '#fcd34d',
            fontFamily: 'monospace',
          }}
        >
          {finalPrompt}
        </pre>
      </div>
      <div className="p-4 border-t border-amber-700/50 flex gap-2">
        <button
          onClick={onCopy}
          className="flex-1 py-3 font-bold rounded flex items-center justify-center gap-2 text-amber-950 border-2 border-amber-300 italic"
          style={{
            background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
            boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)',
          }}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" /> Inscribed!
            </>
          ) : (
            <>📜 Copy the Spell</>
          )}
        </button>
      </div>
    </>
  );
}

export default function PromptModal({ onClose }) {
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [examTarget, setExamTarget] = useState('');
  const [copied, setCopied] = useState(false);

  const org = selectedOrg ? ORG_PROMPTS.find((o) => o.id === selectedOrg) : null;

  const finalPrompt = useMemo(() => {
    if (!org) return '';
    return buildFinalPrompt(org.prompt, examTarget);
  }, [org, examTarget]);

  const onCopy = async () => {
    const ok = await copyToClipboard(finalPrompt);
    setCopied(ok);
    setTimeout(() => setCopied(false), 2000);
  };

  const onBack = () => {
    setSelectedOrg(null);
    setExamTarget('');
    setCopied(false);
  };

  if (!selectedOrg) {
    return (
      <ModalShell onClose={onClose}>
        <OrgPicker orgs={ORG_PROMPTS} onPick={setSelectedOrg} onClose={onClose} />
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose}>
      <PromptViewer
        org={org}
        examTarget={examTarget}
        setExamTarget={setExamTarget}
        finalPrompt={finalPrompt}
        copied={copied}
        onCopy={onCopy}
        onBack={onBack}
        onClose={onClose}
      />
    </ModalShell>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `cd dungeon-scholar && npm test -- components/PromptModal.test.jsx`
Expected: PASS — all 7 tests in this file.

- [ ] **Step 5: Run the full test suite**

Run: `cd dungeon-scholar && npm test`
Expected: PASS — all prompt module tests + new modal tests + existing useAuth/usePlayerState/persistence/etc tests.

- [ ] **Step 6: Run dev server smoke test**

Run: `cd dungeon-scholar && npm run dev` in a separate terminal.
Open `http://localhost:5173`. Steps:
1. Navigate to a state where the tutorial's "Behold the Spell of Tome Creation" button is visible (or open the prompt directly via the existing tutorial trigger).
2. Click → Step 1 picker should show 11 org buttons (alphabetical, Generic last).
3. Click "CompTIA" → Step 2 should show the CompTIA prompt with the EXAM TARGET text input.
4. Type "Security+ SY0-701" → preview updates to show that value.
5. Click "📜 Copy the Spell" → button changes to "Inscribed!" → paste into a text editor and confirm the prompt has `EXAM TARGET: Security+ SY0-701`.
6. Click back arrow → Step 1 again. Click "Generic" → confirm the Generic prompt loads.
7. Click X → modal closes.

Stop the dev server.

- [ ] **Step 7: Commit**

```bash
cd /home/patrick/home-lab
git add dungeon-scholar/src/components/PromptModal.jsx dungeon-scholar/src/components/PromptModal.test.jsx
git commit -m "feat(dungeon-scholar): two-step PromptModal with per-org prompts

Replace the single fantasy-themed prompt with a state-machine modal:
Step 1 picks one of 11 orgs (alphabetical, Generic last); Step 2 shows
that org's prompt with an optional EXAM TARGET text input that is
substituted into the prompt's 'EXAM TARGET:' line at copy time.

The picker is rendered as a list of buttons in a shared ModalShell.
Copy uses the existing execCommand-then-clipboard fallback path.
Tests cover Step 1 rendering, Step 1→2→1 navigation with input clear,
input-to-preview substitution, and copy behavior with both empty and
filled exam-target values."
```

---

## Task 16: Manual quality eval — pick three orgs and run end-to-end

This is non-coding QA — verify generated tomes meet the design's quality bar.

**Files:** none modified. Output is a checklist documented in the implementation plan only.

- [ ] **Step 1: Spin up the dev server**

Run: `cd dungeon-scholar && npm run dev` in a separate terminal.

- [ ] **Step 2: Generate three tomes against three orgs**

For each of these three orgs (cover one cloud, one offensive, one governance):
1. Open the modal in the app, pick the org, fill in the EXAM TARGET, copy the prompt.
2. Paste into Claude (claude.ai) or ChatGPT.
3. Provide a real piece of cybersecurity study material (a chapter from a study guide, a CompTIA objectives document, an AWS whitepaper, or similar — whichever matches the org).
4. Save the resulting JSON tome and import it into Dungeon Scholar via the existing "Inscribe a Tome" flow.

Suggested test orgs:
- **CompTIA** with EXAM TARGET = "Security+ SY0-701" + a Sec+ chapter on Identity & Access Management
- **AWS** with EXAM TARGET = "Security Specialty SCS-C02" + an AWS IAM whitepaper or re:Inforce session transcript
- **(ISC)²** with EXAM TARGET = "CISSP" + a CISSP study-guide chapter on Risk Management

- [ ] **Step 3: Verify each tome against the rubric**

For each generated tome, check:

- [ ] Quiz items use scenario stems ≥2 sentences (sample 5 items)
- [ ] Each MC quiz item ends in BEST/MOST/FIRST/PRIMARY/NEXT or equivalent
- [ ] Distractors are plausible (not obvious wrong answers like "Microsoft Word" for a security question)
- [ ] At least one lab has multi-stage scenario with realistic artifact (log line, command, config, policy excerpt) appropriate to the org
- [ ] `knowledgeBase` uses `=== Domain N: <Name> ===` markers
- [ ] Each KB paragraph starts with `Domain N: <concept>.` and is ≥4 sentences
- [ ] Total KB ≥3000 words (rough word count: copy KB into a word counter)
- [ ] Item counts meet org minimums (CompTIA ≥80/80/10; AWS ≥80/80/10; (ISC)² ≥80/120/4)
- [ ] No fantasy framing in technical content fields (front, back, question, options, scenario, prompt, KB paragraphs)
- [ ] Mild fantasy permitted in `explanation` and `hint` (this is a feature, not a bug)
- [ ] Items have an `objective` field referencing the blueprint

- [ ] **Step 4: Verify Oracle RAG quality**

For at least one of the three tomes:
1. Set the imported tome as the active tome in Dungeon Scholar.
2. Open the Oracle and ask a domain-specific question (e.g. for the CompTIA tome: "What's the difference between authentication factors?").
3. Verify the Oracle returns an answer that cites a `[N]` source from the knowledge base.
4. Verify the cited chunk(s) are topically relevant (this validates the `=== Domain ===` chunking format works for retrieval).

- [ ] **Step 5: If any tome fails the rubric, capture the failure mode**

Document failures in `docs/SUGGESTIONS-LOG-DNDAPP.md` under the "future-idea" or "design-gotcha" category, per `docs/LOG-INSTRUCTIONS.md`. Do not loop the prompt change in this PR — the prompt content is what shipped; tuning is a future cycle.

- [ ] **Step 6: No commit needed unless the log was updated**

If `docs/SUGGESTIONS-LOG-DNDAPP.md` got an entry, commit it:

```bash
cd /home/patrick/home-lab
git add docs/SUGGESTIONS-LOG-DNDAPP.md
git commit -m "docs(dnd-app): tome-creation prompt eval notes

Manual eval of the per-org tome-creation prompts surfaced <briefly
describe what was found>. Captured for follow-up tuning."
```

Otherwise, this task is complete with no commit.

---

## Done

All 11 org prompts are wired through a two-step modal that injects an optional EXAM TARGET into the prompt before copying. Manual eval validates the output quality. The schema's optional `objective` field is in place but unused by the app (additive only — no parser changes were required). Future work (deferred per spec): per-domain analytics that consume `objective`, automated quality eval, pre-flight tome linter, tutorial-copy refresh.

