import { SHARED_HEADER, SHARED_SCHEMA, SHARED_STYLE_RULES, SHARED_FOOTER } from './_shared.js';

export const GIAC_PROMPT_META = {
  id: 'giac',
  name: 'GIAC',
  emoji: '⚜️',
  subtitle: 'GSEC, GCIH, GPEN, GCFA, GREM',
  examTargetPlaceholder: 'e.g. GCIH',
  commonExams: [
    'GSEC',
    'GCIH',
    'GPEN',
    'GCFA',
    'GCFE',
    'GREM',
    'GWAPT',
    'GMON',
    'GCIA',
    'GMOB',
    'GCED',
    'GICSP',
    'GCCC',
  ],
};

export const GIAC_PROMPT = `${SHARED_HEADER}

ORGANIZATION: GIAC (Global Information Assurance Certification — SANS-affiliated)

EXAM TARGET: <leave blank to let me infer from materials>

=== ABOUT GIAC EXAMS ===

GIAC exams are open-book: candidates carry indexed printed notes into the exam, and items are designed to test deep, applied technical knowledge that is hard to memorize but easy to reference if your notes are well-organized. Items frequently present a tool output snippet (Wireshark display, Volatility plugin output, Sysmon Event ID 1, Snort alert, packet hex) and ask what the candidate observes, what attack stage it represents, or what the next investigation step is. Calculation-style items (subnet math, CVSS, hash math) appear regularly.

Distractors lean on close-but-wrong tool output interpretation, off-by-one packet field offsets, and adjacent-but-distinct ATT&CK techniques.

=== COMMON GIAC EXAMS ===

- GSEC (broad foundational security)
- GCIH (incident handler — focus of SEC504)
- GPEN (pentester — SEC560)
- GCFA / GCFE (forensic analyst / examiner — FOR508 / FOR500)
- GREM (reverse engineer malware — FOR610)
- GWAPT (web app pentester — SEC542)
- GMON (continuous monitoring — SEC511)
- GCIA (intrusion analyst — SEC503)
- GMOB, GCED, GICSP (industrial control systems), GCCC

=== BLUEPRINT STRUCTURE ===

GIAC blueprints are SANS-course-aligned. GCIH covers: Incident Handling Process, Reconnaissance, Scanning, Exploitation, Lateral Movement, Persistence, Covering Tracks, Cryptanalysis, ATT&CK Mapping. GCIA covers: Packet Analysis, Wireshark, Snort, Network Forensics, IDS Tuning, Anomaly Detection. Use the EXAM TARGET's actual blueprint sections for domain headers.

Use \`=== Domain N: <Phase or SANS course module> ===\` headers. Tag each item's \`objective\` with the blueprint section.

=== VOLUME + COVERAGE REQUIREMENTS ===

- ≥80 flashcards
- ≥120 quiz questions (GIAC's open-book format pushes deep coverage; more items = better index practice)
- ≥10 labs (tool-output interpretation scenarios)
- ≥5 flashcards, ≥5 quiz items, ≥1 lab per blueprint section
- Embed real tool output prominently — GIAC notes are organized around tool outputs

=== STYLE GUIDANCE ===

Quiz stems must:
- Often present a tool output, packet hex, log line, or memory artifact
- Ask "what does this output indicate?", "what is the attacker's next step?", "which signature would detect this?"
- Include calculation items (subnet math, CVSS scoring, hash collision probability, password-cracking time estimates)

Distractor patterns GIAC loves:
- Close-but-wrong tool output interpretation
- Adjacent ATT&CK techniques (T1003.001 vs T1003.003)
- Off-by-one packet field offset
- Right tool, wrong plugin (Volatility \`pslist\` vs \`psscan\` vs \`pstree\`)

Lab/PBQ artifacts to embed:
- Wireshark display rows or packet hex
- Volatility plugin output (pslist, malfind, netscan, dlllist)
- Sysmon Event IDs (1 ProcessCreate, 3 NetworkConnect, 7 ImageLoad, 11 FileCreate)
- Snort/Suricata alert text
- PowerShell transcript fragments

=== EXEMPLARS ===

✅ GOOD flashcard:

{
  "id": "fc1",
  "front": "Volatility plugin: pslist vs psscan vs pstree — when does each find a process?",
  "back": "pslist: walks the doubly-linked _EPROCESS list (PsActiveProcessHead). Misses processes hidden by direct kernel object manipulation (DKOM unlinking). psscan: scans physical memory for _EPROCESS pool tags — catches DKOM-unlinked and recently-terminated processes. pstree: shows the parent-child tree from pslist data — useful for spotting suspicious parent-child relationships (e.g. winword.exe spawning powershell.exe). Run all three; compare output to find rootkit-hidden processes.",
  "hint": "List walk vs pool scan vs hierarchy — three different views of the process landscape.",
  "objective": "Memory Forensics"
}

✅ GOOD multiple-choice quiz:

{
  "id": "q1",
  "type": "multiplechoice",
  "question": "You are reviewing Sysmon logs from a suspected-compromised workstation. Event ID 1 (ProcessCreate) shows: ParentImage=C:\\\\Program Files\\\\Microsoft Office\\\\WINWORD.EXE spawning Image=C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe with CommandLine='-NoP -W Hidden -Enc <base64>'. What is the MOST likely attacker stage represented by this event?",
  "options": [
    "T1190 — Exploit Public-Facing Application",
    "T1059.001 — Command and Scripting Interpreter: PowerShell, triggered via T1566.001 phishing macro",
    "T1078 — Valid Accounts",
    "T1003.001 — LSASS Memory dumping"
  ],
  "correctIndex": 1,
  "explanation": "Office (WINWORD) spawning PowerShell with -NoP -W Hidden -Enc is a textbook macro-delivered execution (T1566.001 → T1059.001). The encoded command (-Enc) and hidden window (-W Hidden) signal evasion intent. T1190 is initial access via web-app exploit (different vector); T1078 is credential abuse without an exec event; T1003.001 would show lsass.exe in the parent or target image, not WINWORD."
}

❌ BAD multiple-choice quiz:

{
  "id": "q_bad",
  "type": "multiplechoice",
  "question": "What does GIAC stand for?",
  "options": ["Global Information Assurance Certification", "General Intelligence Access Center", "Graduate IT Analyst Council", "Global IT Assessment Council"],
  "correctIndex": 0
}

Why this is bad: trivia, no scenario, no tool output. GIAC tests applied analysis.

✅ GOOD lab (tool-output investigation):

{
  "id": "lab1",
  "title": "Triage suspicious memory artifacts from a possibly-compromised endpoint",
  "scenario": "An EDR alert flagged a finance-department workstation. You captured a memory image with WinPmem and are running Volatility 3 against it. Initial output: vol -f mem.raw windows.pslist shows winword.exe (PID 4532) → powershell.exe (PID 5104) → conhost.exe (PID 5120). Network connections: vol windows.netscan shows powershell.exe with established TCP connection to 185.220.101.42:443.",
  "objective": "Memory Forensics + ATT&CK Mapping",
  "steps": [
    {
      "prompt": "Which Volatility 3 plugin would BEST extract the full PowerShell command line that was executed?",
      "options": ["windows.pslist", "windows.cmdline", "windows.netscan", "windows.malfind"],
      "correctIndex": 1,
      "explanation": "windows.cmdline parses _PEB.ProcessParameters.CommandLine for each process — exactly what we need to see the PowerShell args."
    },
    {
      "prompt": "windows.cmdline reveals: powershell.exe -NoP -W Hidden -Enc JABjAGwAaQBlAG4AdAA9AE4AZQB3AC0ATwBiAGoAZQBjAHQAIABTAHkAcwB0AGUAbQAuAE4AZQB0AC4AUwBvAGMAawBlAHQAcwAuAFQAQwBQAEMAbABpAGUAbgB0AA== (truncated). Type the PowerShell flag whose presence strongly suggests obfuscated/evasive payload delivery.",
      "acceptedAnswers": ["-Enc", "-EncodedCommand", "-enc"],
      "explanation": "-Enc / -EncodedCommand passes a base64-encoded UTF-16LE string to PowerShell. Common evasion of command-line logging that does not decode the parameter."
    },
    {
      "prompt": "Decoding the base64 reveals 'New-Object System.Net.Sockets.TCPClient' — a reverse-shell idiom. Which ATT&CK technique BEST classifies this stage?",
      "options": [
        "T1071.001 — Application Layer Protocol: Web Protocols",
        "T1059.001 — Command and Scripting Interpreter: PowerShell",
        "T1571 — Non-Standard Port",
        "T1095 — Non-Application Layer Protocol"
      ],
      "correctIndex": 1,
      "explanation": "T1059.001 (PowerShell scripting) is the execution technique. T1071.001 covers the C2 channel itself (which is also present), but the question asks about the stage represented by the powershell.exe execution. In real ATT&CK mapping, you would map both."
    },
    {
      "prompt": "Which Volatility 3 plugin BEST identifies injected code regions inside running processes (e.g. injected shellcode)?",
      "options": ["windows.pslist", "windows.malfind", "windows.dlllist", "windows.handles"],
      "correctIndex": 1,
      "explanation": "windows.malfind scans memory for executable, RWX, or non-mapped regions inside processes — the classic indicator of code injection."
    }
  ]
}

❌ FANTASY LEAK — NEVER: tool-output analysis must read like a SOC analyst's notes, not a bard's tale.

${SHARED_SCHEMA}

${SHARED_STYLE_RULES}

${SHARED_FOOTER}`;
