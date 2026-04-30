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
