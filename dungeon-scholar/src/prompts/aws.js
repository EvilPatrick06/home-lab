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

=== PER-EXAM STYLE NOTES ===

Adjust the question voice and service mix to match the EXAM TARGET:

- **Cloud Practitioner CLF-C02** — foundational, breadth over depth. Items reference single AWS services in simple business contexts. Distractors are unrelated services. Don't write multi-service architecture questions here — that's SAA territory.
- **Solutions Architect Associate SAA-C03** — design across the Well-Architected pillars (Security/Reliability/Performance/Cost/Operational Excellence/Sustainability). Items are 2-4 service combinations: "company needs X with Y constraint — which architecture BEST satisfies?" Distractors mix services that *work* but lose on a pillar (cost, scale, operational overhead).
- **Security Specialty SCS-C02** — deep IAM/KMS/GuardDuty/Macie/Detective/Inspector/Security Hub. Items reference incident-response scenarios on AWS, IAM policy traps, KMS grant edge cases, CloudTrail forensics. Include IAM/KMS policy JSON inline in scenarios.
- **Solutions Architect Professional SAP-C02** — multi-account/Org/migration scale. Items reference 5+ accounts, Control Tower, SCPs, Resource Access Manager, hybrid connectivity, migration from on-prem. Distractors are single-account thinking.
- **DevOps Engineer Pro DOP-C02** — CI/CD pipelines, deployment strategies (blue/green/canary), CodePipeline + CodeDeploy + CloudFormation/CDK. Items reference rollback automation, deployment health checks, IaC drift detection.
- **SysOps Admin SOA-C02** — operations lens. Items reference CloudWatch alarms, Systems Manager, Auto Scaling tuning, AWS Config rules.

If EXAM TARGET is blank, default to SAA-C03 style.

=== BLUEPRINT STRUCTURE ===

AWS exams group objectives by service category or task domain. Security Specialty (SCS-C02) uses 6 domains: Threat Detection and Incident Response, Security Logging and Monitoring, Infrastructure Security, Identity and Access Management, Data Protection, Management and Security Governance. SAA-C03 uses 4 domains: Design Secure Architectures, Design Resilient Architectures, Design High-Performing Architectures, Design Cost-Optimized Architectures.

Use \`=== Domain N: <Name> ===\` headers in the knowledge base. Tag each item's \`objective\` field with the domain name or service area (e.g. \`"IAM"\`, \`"Domain 4 — Identity and Access Management"\`, \`"Data Protection — KMS"\`).

Populate \`metadata.domainWeights\` with the AWS exam guide percentages for the EXAM TARGET (e.g. SAA-C03: Design Secure Architectures 30%, Resilient 26%, High-Performing 24%, Cost-Optimized 20%). Domain names MUST exactly match the per-question \`domain\` strings.

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥120 flashcards
- ≥120 quiz questions (AWS-specific mix: ~80-90% multiplechoice, ~5-10% truefalse, ~5-10% fillblank for IAM action strings / KMS key-policy values / CLI commands)
- ≥12 labs (service-scenario design exercises with IAM/KMS/bucket policy JSON inline)
- ≥3 flashcards, ≥3 quiz items, ≥1 lab per domain
- Proportional coverage: items per domain match the AWS exam guide percentages (±5%); SAA-C03 Security 30% → ~36 of 120 quiz items, Resilient 26% → ~31, High-Perf 24% → ~29, Cost-Optimized 20% → ~24
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
  "objective": "Domain 5 — Data Protection",
  "domain": "Data Protection",
  "difficulty": 2,
  "bloomLevel": "understand"
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
  "explanation": "Option C (one bucket per tenant + per-tenant IAM role assumed via STS) is correct because it places the trust boundary at the resource level — a compromised role for tenant A cannot read tenant B's bucket no matter what session policy is applied. Option A (shared role + key prefixes) leaks across all tenants if the shared role is compromised — a single mistake exposes everyone. Option B (session policies derived from tenant ID at request time) is operationally heavier and depends on flawless session-policy construction at every request; a bug in the policy builder is a cross-tenant data leak. Option D (bucket-policy aws:userid wildcards) is fragile: bucket-policy-only enforcement is easy to misconfigure and a single typo opens the bucket. Brave architect, defense-in-depth means separating the trust boundary at the resource level when feasible.",
  "hint": "Work backward: which option survives if a service account credential is stolen?",
  "domain": "Data Protection",
  "difficulty": 4,
  "bloomLevel": "evaluate"
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
  "domain": "Data Protection",
  "difficulty": 4,
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
