export const SHARED_HEADER = `You are creating a tome file for Dungeon Scholar, a study app that converts study materials into structured exam-prep content. I will provide study materials (notes, PDFs, slides, video transcripts, lecture recordings, textbook chapters). Generate a single JSON object matching the schema below.

The user is preparing for a real-world certification exam. Your output must reflect the question style, blueprint coverage, and pedagogical depth of that exam — not generic study trivia.

QUALITY BAR: every flashcard, quiz item, and lab you write should feel indistinguishable from items the actual exam vendor publishes. The reader should not be able to tell the difference between your output and an official practice exam. Aim higher than a textbook quiz; aim for the certification itself.`;

export const SHARED_SCHEMA = `=== JSON SCHEMA ===

{
  "metadata": {
    "title": "Course or exam name (required)",
    "description": "Brief summary (required)",
    "subject": "Cybersecurity (recommended)",
    "author": "Optional source author or course creator",
    "examTarget": "Optional but strongly recommended: exact cert + version, e.g. 'CompTIA Security+ SY0-701' or 'CISSP 2024 CBK'. Drives style + blueprint inference.",
    "difficulty": 3,
    "tags": ["cert-prep", "<exam-code>", "<topic-tags>"],
    "version": "1.0",
    "domainWeights": {
      "<Domain Name 1>": 15,
      "<Domain Name 2>": 25,
      "<Domain Name 3>": 30,
      "<Domain Name 4>": 20,
      "<Domain Name 5>": 10
    }
  },
  "knowledgeBase": "Structured reference text — see KB FORMAT below",
  "flashcards": [
    {
      "id": "fc1",
      "front": "Term, concept, or question (technical, no fantasy)",
      "back": "Definition or answer (technical, no fantasy). Aim for ≥3 sentences with concrete detail, not a one-liner.",
      "hint": "Optional — mild fantasy flavor permitted",
      "objective": "Optional blueprint reference, e.g. '1.4' or 'Domain 3'",
      "domain": "Recommended — same domain taxonomy as quiz items (powers the Domain Study screen's Study via Scrolls filter)",
      "difficulty": 2,
      "bloomLevel": "understand",
      "tags": ["Optional sub-topic tags"]
    }
  ],
  "quiz": [
    {
      "id": "q1",
      "type": "multiplechoice",
      "question": "Scenario stem ≥2 sentences, ending in BEST/MOST/FIRST/PRIMARY/NEXT qualifier (technical, no fantasy)",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "Why the correct option is correct AND why each wrong option is wrong, addressed individually (mild fantasy flavor permitted)",
      "hint": "Optional — mild fantasy flavor permitted",
      "objective": "Optional blueprint reference",
      "domain": "Required — high-level domain from the exam blueprint (e.g. 'Network Security', 'IAM', 'Risk Management')",
      "difficulty": 3,
      "bloomLevel": "apply",
      "tags": ["Optional sub-topic tags for finer-grained heatmap analytics"]
    },
    {
      "id": "q2",
      "type": "truefalse",
      "question": "Technical statement to evaluate — must require reasoning, not pure trivia",
      "correctAnswer": true,
      "explanation": "Why — if false, name the misconception the question targets",
      "hint": "Optional",
      "objective": "Optional",
      "domain": "Required — see q1 above",
      "difficulty": 2,
      "bloomLevel": "understand",
      "tags": ["Optional"]
    },
    {
      "id": "q3",
      "type": "fillblank",
      "question": "The ___ protocol encrypts web traffic.",
      "acceptedAnswers": ["HTTPS", "https", "TLS"],
      "explanation": "Why",
      "hint": "Optional",
      "objective": "Optional",
      "domain": "Required — see q1 above",
      "difficulty": 2,
      "bloomLevel": "remember",
      "tags": ["Optional"]
    }
  ],
  "labs": [
    {
      "id": "lab1",
      "title": "Realistic scenario title (technical)",
      "scenario": "≥3 sentences setting up an incident, audit, deployment, or alert. Reference real artifacts (log lines, command output, config excerpts, alert text) inline so the candidate sees what they'd see on the job.",
      "objective": "Optional blueprint reference",
      "domain": "Required — same domain taxonomy as quiz items",
      "difficulty": 3,
      "tags": ["Optional"],
      "steps": [
        {
          "prompt": "Step instruction or analysis question (technical)",
          "options": ["A", "B", "C"],
          "correctIndex": 1,
          "explanation": "Why correct + why each distractor is wrong (mild fantasy flavor permitted)",
          "domain": "Optional — defaults to the lab-level domain if absent",
          "difficulty": 3,
          "bloomLevel": "apply",
          "tags": ["Optional"]
        },
        {
          "prompt": "Free-response step asking for a specific command, value, or short text answer",
          "acceptedAnswers": ["answer1", "answer 1"],
          "explanation": "Why",
          "domain": "Optional",
          "difficulty": 3,
          "bloomLevel": "apply",
          "tags": ["Optional"]
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
- Total knowledge base ≥4000 words for typical exam scope; scale up for large blueprints (CISSP / SAP-C02 / SC-100 → ≥8000 words)
- **KB COVERAGE DISCIPLINE:** every concept tested by a quiz item or covered by a flashcard MUST have a corresponding KB paragraph. If you generate a quiz item on "TLS handshake order", there must be a KB paragraph in the appropriate domain mentioning "TLS handshake" with enough surrounding context for the Oracle to retrieve. Without this, the Oracle returns "no context found" when the student asks for help.

=== ITEM ID REQUIREMENTS ===

- Every flashcard, quiz item, and lab must have a unique \`id\` (e.g. \`fc1\`, \`fc2\`, \`q1\`, \`q2\`, \`lab1\`)
- IDs must be stable strings (no spaces, no special characters)
- The optional \`objective\` field on each item should reference your blueprint (e.g. CompTIA "1.4", CISSP "Domain 3", AWS "IAM", CMMC "AC.L2-3.1.1")

=== DOMAIN TAGGING (REQUIRED for analytics) ===

- Every quiz item and every lab MUST carry a top-level \`domain\` string drawn from the exam's blueprint domains (the same names you used in \`=== Domain N: <Name> ===\` knowledge base headers)
- Every flashcard SHOULD carry the same \`domain\` string — it's recommended, not required (legacy tomes without flashcard domains still work, but the Domain Study screen's "Study via Scrolls" button only finds tagged cards)
- Lab \`steps[]\` may carry their own \`domain\` field; if absent, the parent lab's domain applies
- Use a STABLE, REUSABLE domain string per topic ('Network Security', not 'Network Security Concepts and Tools') — this powers an in-app accuracy heatmap that groups questions across delves
- Optional \`tags\` array: 1-3 sub-topic tags (e.g. ["TLS", "PKI"]) for finer-grained breakdowns. Keep tags short and reusable across items
- Without \`domain\`, the heatmap will bucket items as 'Uncategorized' — please fill it in

=== DOMAIN WEIGHTS (exam-blueprint percentages) ===

\`metadata.domainWeights\` is an object mapping each domain name to its percentage of the **real cert exam** as published in the official blueprint. The Domain Study screen surfaces these so the player can prioritize study by exam impact.

- Each value is a number 0-100 representing the domain's share of the exam (e.g. CompTIA Security+ SY0-701: General Security Concepts = 12%, Threats/Vulnerabilities/Mitigations = 22%, Architecture = 18%, Operations = 28%, Program Management = 20%)
- Values should sum to ~100 (98-102 is fine — published blueprints occasionally round)
- Domain names MUST match the per-question \`domain\` strings exactly — same casing, same wording. Otherwise the Domain Study screen cannot join the rows
- Use the SAME domain names as your \`=== Domain N: <Name> ===\` knowledge base headers
- If the cert exam doesn't publish a per-domain weight (rare for major certs), distribute evenly across listed domains and note the assumption in \`metadata.description\`
- Skipping \`domainWeights\` is permitted only when no published blueprint exists; the Domain Study screen still works without it (it just hides the "% of exam" tag)

=== VOLUME + PROPORTIONAL COVERAGE (CRITICAL) ===

Minimum item counts for any tome targeting a real cert exam:

- **≥120 flashcards**
- **≥120 quiz items**
- **≥12 labs**

Per-org prompts may raise these floors but never lower them. Scale up proportionally if the source material covers a larger scope (e.g. CISSP-scope materials should yield ≥150 quiz items).

**Proportional-coverage rule:** the count of items per domain must roughly match \`domainWeights\` (±5 percentage points), not just meet a flat per-domain minimum. Example: 120 quiz items at Sec+ SY0-701 weights →

| Domain | Weight | Target quiz items | Floor |
|---|---|---|---|
| General Security Concepts | 12% | ~14 | 10 |
| Threats/Vulnerabilities/Mitigations | 22% | ~26 | 20 |
| Architecture | 18% | ~22 | 17 |
| Operations | 28% | ~34 | 27 |
| Program Management | 20% | ~24 | 19 |

A 30%-weighted domain getting only 5 items is a FAIL even if it meets the per-domain minimum. The exam will hit that domain on 30% of questions; the tome must mirror that ratio.

Per-blueprint-sub-objective floor (when applicable): ≥3 flashcards, ≥3 quiz items per sub-objective, ≥1 lab per major sub-objective cluster. Not every cert has sub-objectives; honor the per-org instruction.

**Quiz type mix** (across all quiz items):

- 65-75% \`multiplechoice\`
- 10-15% \`truefalse\` — only when the statement requires reasoning (no trivia T/F)
- 10-15% \`fillblank\` — for command syntax, exact values, port numbers, protocol names, regex
- Some orgs deviate (e.g. (ISC)² has no fillblank; Cisco is fillblank-heavy for IOS commands). Per-org prompts override this default.

=== ITEM DIFFICULTY (1-5 scale) ===

Every flashcard, quiz item, and lab carries an integer \`difficulty\` 1-5:

- **1 — Trivial recall.** Definitions, acronyms, single-fact lookups. Should be rare (≤10% of total items).
- **2 — Concept understanding.** Why something works, when to use it, simple comparisons.
- **3 — Applied scenario.** Given a situation, pick the right action. Most cert exam items live here.
- **4 — Multi-step analysis.** Requires combining 2+ concepts or evaluating trade-offs before answering.
- **5 — Expert judgment / corner case.** Synthesis, edge-case reasoning, exam-question "trap" patterns.

Target distribution across the quiz: ~10% level-1, ~20% level-2, ~40% level-3, ~20% level-4, ~10% level-5. Flashcards skew lower (lots of 1-2, some 3); labs skew higher (mostly 3-5).

=== BLOOM'S LEVEL (cognitive depth) ===

Every flashcard, quiz item, and lab step carries a \`bloomLevel\` string. Allowed values:

- **\`"remember"\`** — recall facts (definitions, acronyms, port numbers)
- **\`"understand"\`** — explain meaning, summarize, compare/contrast
- **\`"apply"\`** — use knowledge in a scenario (most cert exam questions live here)
- **\`"analyze"\`** — break down a scenario, identify root cause, evaluate trade-offs
- **\`"evaluate"\`** — judge between competing options, defend a choice
- **\`"create"\`** — synthesize a plan, design a control, author a policy (rare in MC exams, common in labs)

**Target distribution across the quiz:** ~15% remember, ~15% understand, ~45% apply, ~15% analyze, ~10% evaluate. Flashcards weight more toward remember/understand. Labs weight toward apply/analyze/evaluate/create.`;

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

=== QUESTION STEM STYLE (every multiple-choice quiz item) ===

- Stem ≥2 sentences, scenario-driven (set who, what, where, why-it-matters)
- Opens with a real actor: SOC analyst, network administrator, security architect, application owner, compliance officer, junior technician, on-call engineer
- Includes at least one concrete detail (port, protocol, log line, command, service name, headcount, time window) so the scenario feels real
- Ends with a qualifier: BEST, MOST, FIRST, PRIMARY, NEXT, LEAST, or equivalent — never just "Which option is correct?"
- All four/five options are the same form factor (don't mix a one-word answer with a three-sentence answer)

=== DISTRACTOR QUALITY BAR (CRITICAL) ===

Every wrong option must be plausible to a candidate who is 70% prepared. Test: would a study partner who reviewed the material once but didn't deeply understand it pick this distractor? If no, the distractor is too obvious — replace it.

**Good distractor sources:**
- Same control family, wrong specific control (WAF vs IPS vs IDS vs proxy)
- Right concept, wrong order (eradicate before contain, deploy before test)
- Off-by-one config (port 443 vs 4433, /24 vs /25, 30-day vs 90-day)
- Near-synonyms with different meaning (authentication vs authorization vs accounting)
- Technically-correct answer that misses the BEST/MOST/FIRST qualifier
- Plausible-sounding but nonexistent feature (most dangerous trap pattern)

**Bad distractor patterns — NEVER USE:**
- Throwaway nonsense ("Tactical Login System" as distractor for TLS)
- Unrelated service categories (S3 vs EC2 when the question is about object storage)
- Clearly partial/incomplete options (one word when others are sentences)
- "All of the above" / "None of the above" — disallowed; force the candidate to pick a specific answer
- "Both A and C" / combination-option traps — disallowed; one correct option per item

=== EXPLANATION DEPTH RULE (CRITICAL) ===

Every multiple-choice explanation MUST:

1. State why the correct option is correct (1-2 sentences)
2. Explicitly address EACH wrong option by content (not just letter) and say why it's wrong (1 sentence each)
3. Optionally close with an exam-strategy nudge ("on Sec+, contain-before-eradicate is a recurring stem pattern")

Example of an acceptable explanation:

"Option B (isolating the workstation) is correct because the incident-response order is prepare → identify → contain → eradicate → recover → lessons learned, and the beaconing pattern indicates active C2 traffic that must be contained before forensics. Option A (block the IP) does not stop the malware from rotating to a new C2 once it loses the current one. Option C (ask the user) wastes time and tips off any attacker monitoring the user's inbox. Option D (URL-filter the dynamic-DNS domain) is helpful longer-term but does not stop the active connection. Brave analyst: contain first, investigate second."

Length target: 60-150 words per explanation. Shorter explanations cheat the student of their best learning moment.

=== HINT QUALITY (when present) ===

If you supply a \`hint\`, structure it as ONE of these patterns:

- **Elimination pattern:** "Two of these options are detective controls; the question asks for preventive."
- **Key-word pattern:** "Notice the stem says FIRST — what does the IR framework do first?"
- **Common-trap pattern:** "Many candidates pick the technically-correct option here; the BEST answer accounts for business impact."
- **Reverse-lookup pattern:** "Work backward: which option survives if the user's credentials are already compromised?"

Hints permit mild fantasy flavor but the strategy embedded in them must be real.

❌ Bad hint: "Trust thy gut, brave scholar." — useless.
✅ Good hint: "Look for the option that survives even when authentication fails — defense-in-depth thinks past the first layer."

=== LAB / PERFORMANCE-BASED QUESTION STYLE ===

- \`scenario\` ≥3 sentences and references a realistic situation (incident, audit, deployment, alert, customer request)
- Include realistic artifacts INLINE in the scenario or step prompts: log lines with timestamps + source IPs + event IDs, real command flags, JSON/XML config excerpts, alert text exactly as a SIEM would render it
- ≥4 stages per lab, mixing MC steps and free-response steps
- Steps should chain: step 2 builds on the insight from step 1, not isolated questions
- Difficulty arc: easy → harder across the lab (warm-up step, then meat, then evaluation/synthesis)
- Avoid pseudocode — write the actual command (e.g. \`aws iam simulate-principal-policy --policy-source-arn ...\`, not \`run the IAM simulator\`)

=== ANTI-PATTERNS (NEVER GENERATE LIKE THIS) ===

These patterns are common in low-effort question banks. Avoid all of them:

1. **Pure-recall trivia** — "What does TLS stand for?" with options that are obvious nonsense. Replace with a scenario.
2. **Definition-as-question** — "Which of the following is the definition of confidentiality?" Force application instead.
3. **Vague qualifiers** — "Which option is correct?" / "Which is true?" Always use BEST/MOST/FIRST.
4. **Combination-option traps** — "Both A and C" / "All of the above" / "None of the above". Banned.
5. **Negative-knowledge pile-ons** — "Which of the following is NOT a..." used more than once per 30 items. Overused; rephrase positively where possible.
6. **Hyper-specific version trivia** — "In version 9.2.3 of product X, the default value of obscure flag Y is what?" unless that exact detail is in the exam blueprint.
7. **Fantasy leak** — any archaic English, magical framing, or D&D reference in technical fields. Fantasy stays in \`explanation\` and \`hint\`.
8. **Bullet-list answers** — options that are themselves multi-line bullet lists. Each option = one clear statement.
9. **Throwaway distractors** — wrong options that nobody preparing for the exam would ever pick. Distractors must be plausible.
10. **One-sentence explanations** — "Because it's the correct one." Explanations must teach.`;

export const SHARED_FOOTER = `=== OUTPUT FORMAT ===

- Save the result as a downloadable .json file (filename: \`tome-<short-name>.json\`) using whatever file/download capability you have available
- If you cannot create a downloadable file, output the JSON inside a single fenced code block so I can copy it cleanly
- Do not split the JSON across multiple messages — it must be one complete object
- Do not output markdown commentary outside the JSON or code block
- Validate before responding: every quiz item has \`domain\` + \`difficulty\` + \`bloomLevel\`; counts meet the minimums; KB has a paragraph for every concept tested; explanations address each distractor; no fantasy in technical fields

Now wait for me to provide the study materials. After receiving them, generate the complete tome.`;
