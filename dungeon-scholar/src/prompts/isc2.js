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
