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

=== PER-EXAM STYLE NOTES ===

Adjust the lens to match the EXAM TARGET:

- **CMMC Level 1** — 17 practices for FCI protection (Federal Contract Information). Self-attestation. Items focus on the foundational practices: AC.L1-3.1.1, AC.L1-3.1.2, AC.L1-3.1.20, AC.L1-3.1.22, IA.L1-3.5.1, IA.L1-3.5.2, MP.L1-3.8.3, PE.L1-3.10.1-5, SC.L1-3.13.1, SC.L1-3.13.5, SI.L1-3.14.1-2 + 3.14.4-5. Distractors confuse Level 1 vs Level 2 practices.
- **CMMC Level 2** — 110 practices from NIST 800-171 r2. Third-party C3PAO assessment. Items reference assessment objectives (each practice has 1-4 objectives in NIST SP 800-171A), assessor methods (examine / interview / test), evidence types, and scoring (Met / Not Met / Not Applicable). Distractors confuse adjacent practices in the same family (3.1.1 vs 3.1.2 vs 3.1.20).
- **CMMC Level 3** — Level 2 + ~24 enhanced practices from NIST 800-172. Government assessment by DCMA DIBCAC. Items emphasize advanced persistent threat (APT) defense: threat hunting, organic CTI, dual authorization for critical actions.
- **CCP — Certified CMMC Professional** — knowledge-only credential. Items cover the CMMC ecosystem (CyberAB, accreditation, assessor roles, scoping CUI environments), the assessment process, NIST 800-171/172 mapping, and OSC responsibilities. Less about specific practices, more about the framework.
- **CCA — Certified CMMC Assessor** — Level 2 assessment authority. Items emphasize assessor methods (the FIPS 200 + SP 800-53A model adapted for CMMC), evidence-gathering, finding-classification, scoring rules, POA&M handling, conditional certifications.

If EXAM TARGET is blank, default to CMMC Level 2 / CCA style (most asked-about).

=== BLUEPRINT STRUCTURE ===

CMMC organizes practices into 14 domains drawn from NIST 800-171: Access Control (AC), Awareness and Training (AT), Audit and Accountability (AU), Configuration Management (CM), Identification and Authentication (IA), Incident Response (IR), Maintenance (MA), Media Protection (MP), Personnel Security (PS), Physical Protection (PE), Risk Assessment (RA), Security Assessment (CA), System and Communications Protection (SC), System and Information Integrity (SI). Practice IDs follow \`<DOMAIN>.L<LEVEL>-<NIST>\` format (e.g. \`AC.L2-3.1.1\`, \`SI.L2-3.14.6\`).

Use \`=== Domain N: <Two-letter code> — <Name> ===\` headers in the knowledge base. Tag each item's \`objective\` with the practice ID.

Populate \`metadata.domainWeights\` with the per-domain practice-count proportions (CMMC does not publish exam blueprint percentages, so distribute weight by practice-count share — e.g. AC has the most Level-2 practices, so it carries the largest weight). Domain names MUST exactly match the per-question \`domain\` strings.

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥120 flashcards (one per practice for Level 1; one per practice family for Level 2)
- ≥120 quiz questions
- ≥12 labs (control-assessment scenarios)
- CMMC mix: ~80-90% multiplechoice, ~5-10% truefalse, ~5-10% fillblank for practice IDs / assessor method names
- ≥3 flashcards, ≥3 quiz items, ≥1 lab per domain (14 domains)
- Proportional coverage: domains with more practices carry proportionally more items (AC has the most Level-2 practices, so AC gets the largest share)
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
  "objective": "AC.L2-3.1.1",
  "domain": "AC — Access Control",
  "difficulty": 2,
  "bloomLevel": "remember"
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
  "explanation": "Option B (IA.L2-3.5.1 Identify users) is the MOST direct failure because the practice's plain language requires identifying users — and a shared password means you literally cannot tell which engineer made which change. Option A (AC.L2-3.1.1 Limit access) is weakened too — access is broader than three engineers know about — but the upstream identification problem is the root cause. Option C (IA.L2-3.5.2 Authenticate identities) is partially impaired but the system DOES authenticate; what fails is binding the authentication to an individual identity. Option D (AU.L2-3.3.1 Create audit logs) is downstream: logs may exist but cannot attribute actions to individuals because of the shared credential. Brave assessor, identification precedes accountability.",
  "hint": "Trace the failure to its upstream cause: which practice is broken first?",
  "domain": "IA — Identification and Authentication",
  "difficulty": 4,
  "bloomLevel": "analyze"
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
  "domain": "AC — Access Control",
  "difficulty": 4,
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
