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
