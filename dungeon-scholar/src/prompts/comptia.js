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
