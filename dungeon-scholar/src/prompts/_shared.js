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
