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

=== BLUEPRINT STRUCTURE ===

CEH v13 has 20 modules organized roughly along the kill chain: Introduction, Footprinting/Recon, Network Scanning, Enumeration, Vulnerability Analysis, System Hacking, Malware, Sniffing, Social Engineering, DoS, Session Hijacking, Evading IDS/Firewalls/Honeypots, Hacking Web Servers, Hacking Web Applications, SQL Injection, Hacking Wireless, Hacking Mobile, IoT/OT Hacking, Cloud Computing, Cryptography. Group these into the kill-chain phases or ATT&CK tactics for the knowledge base.

Use \`=== Domain N: <Phase or Module> ===\` headers. Tag each item's \`objective\` with the module number or kill-chain phase.

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥80 flashcards (one per major tool + one per ATT&CK technique)
- ≥80 quiz questions
- ≥10 labs (tool-driven offensive scenarios)
- ≥5 flashcards, ≥5 quiz items, ≥1 lab per module/phase

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
  "objective": "Module 3 — Scanning"
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
  "explanation": "Kerberoasting requests TGS tickets for accounts with SPNs and cracks them offline. GetUserSPNs.py (or PowerView's Get-DomainUser -SPN) extracts the tickets; hashcat -m 13100 is the matching mode for Kerberos 5 TGS-REP RC4. Nmap's krb5-enum-users enumerates accounts but does not pull crackable tickets. Mimikatz dumps cached creds (different attack). Responder is for LLMNR/NBT-NS poisoning."
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
