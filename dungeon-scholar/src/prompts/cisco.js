import { SHARED_HEADER, SHARED_SCHEMA, SHARED_STYLE_RULES, SHARED_FOOTER } from './_shared.js';

export const CISCO_PROMPT_META = {
  id: 'cisco',
  name: 'Cisco',
  emoji: '⚔️',
  subtitle: 'CCNA, CCNP Security, CCIE, CyberOps Assoc/Pro',
  examTargetPlaceholder: 'e.g. CCNA 200-301',
  commonExams: [
    'CCNA 200-301',
    'CCNP Security SCOR 350-701',
    'CCIE Security',
    'CyberOps Associate 200-201 (CBROPS)',
    'CyberOps Professional 350-201 / 300-215',
    'DevNet Associate',
  ],
};

export const CISCO_PROMPT = `${SHARED_HEADER}

ORGANIZATION: Cisco

EXAM TARGET: <leave blank to let me infer from materials>

=== ABOUT CISCO EXAMS ===

Cisco exams test deep networking and security knowledge with a strong CLI bias. Many items present a partial running-config or \`show\` output and ask the candidate to identify the misconfiguration, predict the next packet's path, or pick the BEST command to remediate. Simulation/sim-let portions of the exam place the candidate at a real (or emulated) IOS prompt and require typing the actual commands.

Distractors lean heavily on close command syntax (\`switchport mode access\` vs \`switchport access vlan\` vs \`switchport mode trunk\`), off-by-one timer values, and protocol-version differences (OSPFv2 vs OSPFv3, EIGRP for IPv4 vs IPv6). Cisco rewards candidates who can read \`show ip route\`, \`show ip ospf neighbor\`, \`show interfaces trunk\`, and \`show running-config\` like prose.

=== COMMON CISCO EXAMS ===

- CCNA 200-301 (associate-level routing/switching/security/automation)
- CCNP Security SCOR 350-701 (NGFW, ISE, Umbrella, Stealthwatch, AMP)
- CCIE Security (lab-based; 8-hour hands-on)
- CyberOps Associate CBROPS 200-201 (SOC analyst; logs, IOCs, NIST framework)
- CyberOps Professional 350-201 + 300-215 (incident response, forensics)
- DevNet Associate (Cisco APIs, automation)

=== BLUEPRINT STRUCTURE ===

CCNA 200-301 has 6 domains: Network Fundamentals, Network Access, IP Connectivity, IP Services, Security Fundamentals, Automation and Programmability. CCNP Security SCOR has 6 domains: Security Concepts, Network Security, Cloud Security, Content Security, Endpoint Protection, Secure Network Access/Visibility/Enforcement. CyberOps CBROPS has 5 domains: Security Concepts, Security Monitoring, Host-Based Analysis, Network Intrusion Analysis, Security Policies and Procedures.

Use \`=== Domain N: <Name> ===\` headers in the knowledge base. Tag each item's \`objective\` field with the domain or sub-objective.

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥80 flashcards
- ≥80 quiz questions (multiplechoice + fillblank for command syntax)
- ≥8 labs (CLI-scenario heavy: read configs, predict packet flow, fix misconfigurations)
- ≥5 flashcards, ≥5 quiz items, ≥1 lab per domain
- Cover IOS configuration, troubleshooting commands, and the EXAM TARGET's protocol/feature set

=== STYLE GUIDANCE ===

Quiz stems must:
- Frequently include a configuration excerpt or \`show\` output
- Ask which command BEST fixes / configures / verifies the situation
- Use fillblank for exact command syntax (e.g. "Type the IOS command that displays the ARP table.")

Distractor patterns Cisco loves:
- Close-but-wrong command syntax (no-shutdown vs shutdown vs no shut)
- Wrong interface mode (access vs trunk vs dynamic auto)
- Wrong protocol version
- Configuration-mode confusion (global config vs interface config vs line config)

Lab/PBQ artifacts to embed:
- \`show running-config\` excerpts (interface, routing, ACL sections)
- \`show ip route\`, \`show ip ospf neighbor\`, \`show interfaces trunk\` output
- ACL listings with line numbers
- Packet captures (Wireshark output text form, or a description of frames)
- CLI prompts (\`Router(config-if)#\`, \`Switch#\`)

=== EXEMPLARS ===

✅ GOOD flashcard:

{
  "id": "fc1",
  "front": "Difference between switchport mode access and switchport mode trunk",
  "back": "switchport mode access — interface carries traffic for exactly one VLAN (the access VLAN); incoming 802.1Q tags are dropped. Used for end-host ports (workstations, phones, APs in some cases). switchport mode trunk — interface carries traffic for multiple VLANs and tags frames with 802.1Q (except the native VLAN); used for switch-to-switch links. Common misconfig: leaving an end-host port in default 'dynamic auto' lets a malicious host negotiate trunking and VLAN-hop.",
  "hint": "Ask: does this port talk to one VLAN or many?",
  "objective": "Network Access"
}

✅ GOOD multiple-choice quiz:

{
  "id": "q1",
  "type": "multiplechoice",
  "question": "A network engineer attempts to ping a host on VLAN 20 from a host on VLAN 10. The router-on-a-stick is configured with subinterfaces Gi0/0.10 (encapsulation dot1Q 10, IP 10.10.10.1/24) and Gi0/0.20 (encapsulation dot1Q 20, IP 10.10.20.1/24). The trunk to the switch is up but the ping fails. Output of 'show interfaces gi0/0.10' shows the line protocol is up. What is the MOST likely cause?",
  "options": [
    "The native VLAN on the trunk does not match between switch and router",
    "The hosts have the wrong default gateway configured",
    "The subinterfaces need 'no shutdown' on each",
    "VLAN 10 and VLAN 20 are in different VRFs"
  ],
  "correctIndex": 1,
  "explanation": "The router subinterfaces are up/up, the trunk is up, and the encapsulation matches — at the router/switch layer everything is fine. The most common end-user-visible failure here is the host pointing at the wrong default gateway (or no gateway at all), which silently drops inter-VLAN traffic at the host. Native-VLAN mismatch generates a CDP/STP error but does not necessarily break the data plane for tagged VLANs."
}

❌ BAD multiple-choice quiz:

{
  "id": "q_bad",
  "type": "multiplechoice",
  "question": "What does CCNA stand for?",
  "options": ["Cisco Certified Network Associate", "Common Cloud Network Architect", "Cisco Cloud Network Associate", "Certified Cisco Network Admin"],
  "correctIndex": 0
}

Why this is bad: pure recall, distractors are nonsense brand variations. Cisco does not test brand trivia.

✅ GOOD lab (CLI-scenario):

{
  "id": "lab1",
  "title": "Diagnose and fix a broken inter-VLAN routing setup",
  "scenario": "A junior tech configured router-on-a-stick on R1 and a trunk on SW1. Hosts in VLAN 10 cannot reach hosts in VLAN 20. Below is 'show running-config' from R1's Gi0/0 and the trunk on SW1 Fa0/24. R1 Gi0/0 (no IP address, no shutdown). R1 Gi0/0.10 (encapsulation dot1Q 10, IP 192.168.10.1/24, no shutdown). R1 Gi0/0.20 (encapsulation dot1Q 30, IP 192.168.20.1/24, no shutdown). SW1 Fa0/24 (switchport trunk encapsulation dot1q, switchport mode trunk, switchport trunk allowed vlan 10,20).",
  "objective": "IP Connectivity",
  "steps": [
    {
      "prompt": "Identify the misconfiguration in R1's running-config that breaks VLAN 20 routing.",
      "options": ["Gi0/0 has no IP address", "Gi0/0.20 has 'encapsulation dot1Q 30' but the VLAN is 20", "The trunk does not allow VLAN 30", "Native VLAN is unset"],
      "correctIndex": 1,
      "explanation": "The subinterface tag must match the VLAN ID. dot1Q 30 on the .20 subinterface means the router is expecting frames tagged 30, but the switch tags them 20. Brave engineer, frame tags must align across the trunk."
    },
    {
      "prompt": "Type the exact configuration commands (in order) to fix this on R1, starting from 'configure terminal'. Use minimal commands.",
      "acceptedAnswers": [
        "configure terminal\\ninterface gi0/0.20\\nencapsulation dot1Q 20",
        "conf t\\ninterface gi0/0.20\\nencapsulation dot1Q 20",
        "interface gi0/0.20\\nencapsulation dot1Q 20"
      ],
      "explanation": "The fix is to change the encapsulation tag on Gi0/0.20 to match VLAN 20."
    },
    {
      "prompt": "After applying the fix, which 'show' command would BEST verify that R1 is now associating Gi0/0.20 with VLAN 20?",
      "options": ["show ip route", "show interfaces gi0/0.20", "show vlan brief", "show running-config interface gi0/0.20"],
      "correctIndex": 3,
      "explanation": "show running-config interface gi0/0.20 confirms the new encapsulation. show interfaces shows up/up (was already up). show vlan brief is a switch command, not router."
    },
    {
      "prompt": "Why is it important to set the native VLAN on the trunk to a value not used for user data (e.g. VLAN 999)?",
      "options": [
        "Because the native VLAN must match between switches",
        "Because untagged frames belong to the native VLAN — putting a user VLAN as native risks VLAN-hopping via double-tagging",
        "Because IOS requires it",
        "Because OSPF runs on the native VLAN"
      ],
      "correctIndex": 1,
      "explanation": "VLAN-hopping via double-tagged 802.1Q frames is feasible if the attacker's access VLAN matches the trunk's native VLAN. Setting the native to an unused VLAN closes that vector."
    }
  ]
}

❌ FANTASY LEAK — NEVER:

{
  "id": "q_leak",
  "type": "fillblank",
  "question": "By what magical incantation doth the brave engineer reveal the routing table?",
  "acceptedAnswers": ["show ip route"]
}

Technical fields stay technical.

${SHARED_SCHEMA}

${SHARED_STYLE_RULES}

${SHARED_FOOTER}`;
