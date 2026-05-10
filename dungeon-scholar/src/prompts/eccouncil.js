import { SHARED_HEADER, SHARED_SCHEMA, SHARED_STYLE_RULES, SHARED_FOOTER } from './_shared.js';

export const ECCOUNCIL_PROMPT_META = {
  id: 'eccouncil',
  name: 'EC-Council',
  emoji: '🗡️',
  subtitle: 'CEH, CHFI, CND, CCISO',
  examTargetPlaceholder: 'e.g. CEH v13',
  commonExams: [
    'CEH v13',
    'CHFI v11 (Computer Hacking Forensic Investigator)',
    'CND (Certified Network Defender)',
    'CCISO',
    'CSCU',
    'CTIA (Threat Intelligence Analyst)',
    'ECSA',
  ],
};

export const ECCOUNCIL_PROMPT = `${SHARED_HEADER}

ORGANIZATION: EC-Council

EXAM TARGET: <leave blank to let me infer from materials>

=== ABOUT EC-COUNCIL EXAMS ===

EC-Council exams (CEH foremost) test offensive-security methodology and tooling. Items emphasize the cyber kill chain (Reconnaissance → Weaponization → Delivery → Exploitation → Installation → Command-and-Control → Actions on Objectives), MITRE ATT&CK tactics/techniques, and the specific tool you reach for at each phase. Distractors include alternate tools that work but at the wrong phase (Nmap during exfiltration), or tools that look right but have a different specialty (John the Ripper vs Hashcat vs Hydra).

CEH and CND lean on knowing what command/flag produces what observable output (e.g. \`nmap -sV\` vs \`-sC\` vs \`-O\`), what each Metasploit module category does (auxiliary vs exploit vs post), and how to interpret tool output snippets (Wireshark, Burp, Nikto, recon-ng, theHarvester).

=== COMMON EC-COUNCIL EXAMS ===

- CEH v13 (ethical hacker — broad offensive methodology and tooling)
- CHFI v11 (forensic investigator — disk imaging, memory analysis, chain of custody)
- CND (defender — detection, response, hardening from a defender's lens)
- CCISO (CISO-track — governance, finance, vendor)
- CTIA (threat intelligence analyst), ECSA, CSCU

=== PER-EXAM STYLE NOTES ===

Adjust the lens to match the EXAM TARGET:

- **CEH v13** — offensive lens. 20 modules along the kill chain (Reconnaissance → Scanning → Enumeration → Vulnerability Analysis → System Hacking → Malware/Sniffing/SE/DoS → Session Hijacking → Evading Defenses → Web/Wireless/Mobile/IoT/Cloud → Cryptography). Items frame the candidate as the attacker. Distractors swap tools across kill-chain phases (Nmap during exfiltration, theHarvester during exploitation).
- **CHFI v11** — forensic investigator lens. Items reference disk imaging (dd, FTK Imager), chain of custody, file-system artifacts (NTFS $MFT, $LogFile, Volume Shadow Copy), Windows registry hives, email forensics, anti-forensics detection. Heavy on legal procedure.
- **CND** — defender lens. Items reverse CEH thinking: given an attack pattern, design the detection / hardening / response. Heavy on SIEM design, logging, network segmentation, defense-in-depth.
- **CCISO** — CISO governance/finance/vendor. Items reference budget, governance committees, vendor risk, regulatory frameworks. Less hands-on than CEH/CHFI.
- **CTIA** — threat intelligence analyst. Items cover the intel lifecycle (planning → collection → processing → analysis → dissemination → feedback), TTPs/IOCs/observables, structured analytic techniques (ACH, Diamond Model, F3EAD), threat actor profiling.

If EXAM TARGET is blank, default to CEH v13 style.

=== BLUEPRINT STRUCTURE ===

CEH v13 has 20 modules organized roughly along the kill chain: Introduction, Footprinting/Recon, Network Scanning, Enumeration, Vulnerability Analysis, System Hacking, Malware, Sniffing, Social Engineering, DoS, Session Hijacking, Evading IDS/Firewalls/Honeypots, Hacking Web Servers, Hacking Web Applications, SQL Injection, Hacking Wireless, Hacking Mobile, IoT/OT Hacking, Cloud Computing, Cryptography. Group these into the kill-chain phases or ATT&CK tactics for the knowledge base.

Use \`=== Domain N: <Phase or Module> ===\` headers. Tag each item's \`objective\` with the module number or kill-chain phase.

Populate \`metadata.domainWeights\` with EC-Council's published blueprint percentages where available (CEH publishes a per-phase breakdown). If the EXAM TARGET doesn't publish weights, distribute by module count and note the assumption in \`metadata.description\`. Domain names MUST exactly match the per-question \`domain\` strings.

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥120 flashcards (one per major tool + one per ATT&CK technique)
- ≥125 quiz questions (CEH v13 real exam is 125 items in 4 hours)
- ≥12 labs (tool-driven offensive scenarios)
- EC-Council mix: ~70-80% multiplechoice, ~5-10% truefalse, ~10-15% fillblank for tool flags / command syntax / ATT&CK technique IDs
- ≥3 flashcards, ≥3 quiz items, ≥1 lab per module/phase
- Proportional coverage: CEH publishes per-phase weights — match them (±5%); System Hacking + Vulnerability Analysis are typically largest sections

=== STYLE GUIDANCE ===

Quiz stems must:
- Frame as a pentest engagement (engagement scoping, ROE, recon, exploitation, post-ex, reporting)
- Ask which tool, technique, or command BEST achieves the attacker's goal
- Include real tool flags, syntax, or output snippets

Distractor patterns EC-Council loves:
- Right phase, wrong tool (Nmap when the answer is Masscan for speed)
- Right tool, wrong flag (\`-sV\` when \`-sC\` runs default scripts)
- Active vs passive recon confusion (theHarvester vs Nmap)
- ATT&CK tactic vs technique confusion (Persistence vs Defense Evasion)

Lab/PBQ artifacts to embed:
- Nmap output (\`Starting Nmap...PORT STATE SERVICE VERSION\`)
- Wireshark display filters and packet hex
- Burp Suite Repeater requests
- Metasploit module options output
- Linux command output (\`whoami\`, \`uname -a\`, \`/etc/passwd\` excerpt)

=== EXEMPLARS ===

✅ GOOD flashcard:

{
  "id": "fc1",
  "front": "nmap -sS vs -sT vs -sU vs -sA — when to use each scan type",
  "back": "-sS (SYN/half-open): default for privileged users, fast, stealthy — does not complete the 3-way handshake. -sT (TCP connect): used when not running as root, completes full handshake (more visible). -sU (UDP scan): probes UDP ports; slow because UDP is connectionless. -sA (ACK scan): does NOT determine open/closed; differentiates filtered vs unfiltered ports — useful for firewall rule mapping.",
  "hint": "Stealth, completeness, protocol, and firewall reconnaissance — pick the scan that matches the goal.",
  "objective": "Module 3 — Scanning",
  "domain": "Scanning",
  "difficulty": 2,
  "bloomLevel": "understand"
}

✅ GOOD multiple-choice quiz:

{
  "id": "q1",
  "type": "multiplechoice",
  "question": "During an authorized engagement, you have a foothold on an internal Windows host as a low-privileged domain user. Your goal is to enumerate Service Principal Names (SPNs) for accounts with weak Kerberos ticket-encryption settings, intending to perform a Kerberoasting attack offline. Which tool/command pair is MOST appropriate at this stage?",
  "options": [
    "nmap -p 88 --script krb5-enum-users <DC>",
    "GetUserSPNs.py from Impacket, then hashcat -m 13100",
    "Mimikatz sekurlsa::logonpasswords",
    "responder -I eth0"
  ],
  "correctIndex": 1,
  "explanation": "Option B (GetUserSPNs.py + hashcat -m 13100) is correct because Kerberoasting requests TGS tickets for accounts with SPNs and cracks them offline — GetUserSPNs.py (or PowerView's Get-DomainUser -SPN) extracts the tickets and hashcat mode 13100 matches Kerberos 5 TGS-REP encrypted with RC4. Option A (nmap krb5-enum-users) enumerates accounts that exist but does not request crackable tickets — wrong tool stage. Option C (Mimikatz sekurlsa::logonpasswords) dumps cached creds from LSASS, which is a different attack (T1003.001 LSASS Memory) that requires privileged local access. Option D (responder) is for LLMNR/NBT-NS poisoning to capture NetNTLMv2 hashes from broadcast traffic — wrong attack family entirely. Right phase, right goal, right tool chain.",
  "hint": "Two of these are tools but don't pull TGS tickets; one is the wrong attack family entirely.",
  "domain": "System Hacking",
  "difficulty": 4,
  "bloomLevel": "apply"
}

❌ BAD multiple-choice quiz:

{
  "id": "q_bad",
  "type": "multiplechoice",
  "question": "What does CEH stand for?",
  "options": ["Certified Ethical Hacker", "Cyber Engineer Hacker", "Critical Exploit Handler", "Computer Engineer Hacker"],
  "correctIndex": 0
}

Why this is bad: pure trivia, no scenario, no methodology. CEH does not write items this lazy.

✅ GOOD lab (offensive scenario):

{
  "id": "lab1",
  "title": "Pentest engagement: from external recon to internal foothold",
  "scenario": "You have signed a Rules of Engagement document for a black-box external pentest of acmecorp.com. The ROE permits all recon, scanning, and exploitation against acmecorp.com and its public IP range 203.0.113.0/24, but prohibits DoS and social engineering. You have 5 days. Below is the initial scope email and an excerpt from your reconnaissance output.",
  "objective": "Module 2-5 — Footprinting through Vulnerability Analysis",
  "domain": "Reconnaissance",
  "difficulty": 3,
  "steps": [
    {
      "prompt": "Which recon tool is BEST for passive enumeration of acmecorp.com email addresses and subdomains BEFORE you touch the target's infrastructure?",
      "options": ["nmap -sV -p- 203.0.113.0/24", "theHarvester -d acmecorp.com -b all", "msfconsole > use auxiliary/scanner/http/ssl_version", "nikto -h https://www.acmecorp.com"],
      "correctIndex": 1,
      "explanation": "theHarvester aggregates passive sources (search engines, certificate transparency, public datasets) without sending packets to the target. Nmap, Metasploit auxiliary, and Nikto all touch the target — appropriate later, not for initial passive recon."
    },
    {
      "prompt": "After passive recon, you run nmap and find 203.0.113.42 has tcp/443 open with TLS 1.0 only. Which Metasploit auxiliary module BEST verifies this finding?",
      "options": [
        "auxiliary/scanner/http/dir_scanner",
        "auxiliary/scanner/ssl/openssl_heartbleed",
        "auxiliary/scanner/ssl/ssl_version",
        "auxiliary/scanner/portscan/syn"
      ],
      "correctIndex": 2,
      "explanation": "ssl_version enumerates supported TLS/SSL versions and confirms TLS 1.0-only configuration. Heartbleed is a different CVE; dir_scanner is content discovery; syn is a port-scan repeat."
    },
    {
      "prompt": "Type the nmap NSE script flag that runs the default 'safe' script category against tcp/443 of 203.0.113.42.",
      "acceptedAnswers": ["-sC", "--script default", "--script=default"],
      "explanation": "-sC equals --script default. Default scripts are vetted as low-risk."
    },
    {
      "prompt": "You exploit a vulnerable web application and gain a www-data shell. To pivot to the database server on the internal /24 network, which technique BEST forwards your local traffic through the foothold?",
      "options": [
        "SSH local port forwarding from your workstation to the web server",
        "Metasploit autoroute + socks_proxy through the active session",
        "Reverse VPN tunnel using OpenVPN",
        "Setting up a rogue DHCP server on the foothold"
      ],
      "correctIndex": 1,
      "explanation": "Metasploit's autoroute + socks_proxy pivots traffic through the existing session into the internal network. SSH local forwarding requires SSH access on the web server. Reverse VPN is heavy and detectable; rogue DHCP is unrelated."
    }
  ]
}

❌ FANTASY LEAK — NEVER: pentest scenarios stay in real engagement language.

${SHARED_SCHEMA}

${SHARED_STYLE_RULES}

${SHARED_FOOTER}`;
