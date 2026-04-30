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
