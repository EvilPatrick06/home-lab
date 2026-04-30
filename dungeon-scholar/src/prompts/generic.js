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

✅ GOOD scenario MC pattern (default):

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
