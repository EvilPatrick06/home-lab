// S16: bundled starter decks so a new install isn't an empty shelf. Kept small
// and factually safe (app usage + well-established study science) — NOT
// fabricated certification content, which should be authored/vetted by a human.
// The Library surfaces these in a "Starter decks" catalog that imports one on click.
const c = (id, front, back, domain) => ({ id, front, back, domain });
const q = (id, question, options, correctIndex, explanation) => ({ id, question, options, correctIndex, explanation });

export const STARTER_DECKS = [
  {
    id: 'starter-getting-started',
    title: 'Getting Started with Dungeon Scholar',
    description: 'Learn how the study modes work — a safe first deck to try every feature.',
    data: {
      metadata: {
        title: 'Getting Started with Dungeon Scholar',
        subject: 'App basics',
        author: 'Dungeon Scholar',
        description: 'How the study modes work.',
      },
      flashcards: [
        c(
          'gs1',
          'What does Flashcards mode use to schedule reviews?',
          'Spaced repetition (SRS) — each card you rate is scheduled for a future day based on how well you knew it.',
          'Modes',
        ),
        c(
          'gs2',
          'How do you rate a flashcard?',
          'Flip it (Space), then pick Again / Hard / Good / Easy (keys 1–4). Harder ratings bring the card back sooner.',
          'Modes',
        ),
        c(
          'gs3',
          'What is the Dungeon Delve?',
          'A top-down RPG view of the same study queue — answer questions to defeat foes and reach the boss.',
          'Modes',
        ),
        c(
          'gs4',
          'What is Practice Exam mode for?',
          'A timed, proctored-style exam: flag questions for review, use the navigator grid, and submit for a graded score.',
          'Modes',
        ),
        c(
          'gs5',
          'Where do you back up your progress?',
          'The Account panel — Export journal downloads a save file; Import journal restores one. Cloud sync is optional.',
          'App',
        ),
      ],
      quiz: [
        q(
          'gsq1',
          'Which key flips a flashcard?',
          ['Space', 'Escape', 'Tab', 'Shift'],
          0,
          'Space (or Enter) flips the card; 1–4 then rate it.',
        ),
        q(
          'gsq2',
          'What does a higher SRS rating (Easy) do?',
          [
            'Schedules the card further out',
            'Deletes the card',
            'Shows it again immediately',
            'Marks the tome complete',
          ],
          0,
          'Easier recall = longer interval before the next review.',
        ),
      ],
      labs: [],
    },
  },
  {
    id: 'starter-study-skills',
    title: 'Study Skills & Spaced Repetition',
    description: 'Evidence-based learning techniques you can apply to any subject.',
    data: {
      metadata: {
        title: 'Study Skills & Spaced Repetition',
        subject: 'Learning science',
        author: 'Dungeon Scholar',
        description: 'Well-established study techniques.',
      },
      flashcards: [
        c(
          'ss1',
          'What is active recall?',
          'Retrieving information from memory (testing yourself) rather than re-reading — it strengthens retention more than passive review.',
          'Techniques',
        ),
        c(
          'ss2',
          'What is spaced repetition?',
          'Reviewing material at increasing intervals over time, which improves long-term retention compared to cramming.',
          'Techniques',
        ),
        c(
          'ss3',
          'What is interleaving?',
          'Mixing different topics or problem types in one study session, which improves discrimination and transfer.',
          'Techniques',
        ),
        c(
          'ss4',
          'What is the testing effect?',
          'The finding that taking practice tests improves later recall more than spending the same time restudying.',
          'Techniques',
        ),
        c(
          'ss5',
          'Why is cramming less effective for long-term memory?',
          'Massed practice fades quickly; spaced, retrieval-based practice produces more durable learning.',
          'Techniques',
        ),
      ],
      quiz: [
        q(
          'ssq1',
          'Which is generally most effective for long-term retention?',
          ['Spaced retrieval practice', 'Highlighting text', 'Re-reading notes', 'Cramming the night before'],
          0,
          'Spacing + active recall consistently outperform passive review.',
        ),
        q(
          'ssq2',
          'Interleaving means…',
          [
            'Mixing topics within a session',
            'Studying one topic to mastery first',
            'Only studying at night',
            'Skipping hard material',
          ],
          0,
          'Interleaving mixes problem types, aiding discrimination.',
        ),
      ],
      labs: [],
    },
  },
  {
    id: 'starter-network-plus',
    title: 'CompTIA Network+ — Fundamentals',
    description:
      'Core networking facts (OSI, ports, addressing). Community starter deck — verify against the current official exam objectives.',
    data: {
      metadata: {
        title: 'CompTIA Network+ — Fundamentals',
        subject: 'Networking',
        author: 'Dungeon Scholar (community starter)',
        description: 'Bedrock networking fundamentals. Not official exam content — verify against current objectives.',
      },
      flashcards: [
        c(
          'np1',
          'List the 7 OSI layers, bottom to top.',
          'Physical, Data Link, Network, Transport, Session, Presentation, Application (mnemonic: Please Do Not Throw Sausage Pizza Away).',
          'OSI Model',
        ),
        c('np2', 'Which OSI layer do IP addresses and routing operate at?', 'Layer 3, the Network layer.', 'OSI Model'),
        c(
          'np3',
          'TCP vs UDP — key difference?',
          'TCP is connection-oriented and reliable (handshake, ordering, retransmission); UDP is connectionless and best-effort (lower overhead, no guaranteed delivery).',
          'Transport',
        ),
        c('np4', 'Default ports: HTTP, HTTPS, SSH, DNS?', 'HTTP 80, HTTPS 443, SSH 22, DNS 53.', 'Ports'),
        c(
          'np5',
          'IPv4 private address ranges (RFC 1918)?',
          '10.0.0.0/8, 172.16.0.0/12, and 192.168.0.0/16.',
          'Addressing',
        ),
        c(
          'np6',
          'How many usable hosts in a /24?',
          '256 total addresses, 254 usable (network + broadcast addresses are reserved).',
          'Subnetting',
        ),
        c(
          'np7',
          'What does DHCP do?',
          'Automatically assigns IP addresses and network config (gateway, DNS) to hosts (DORA: Discover, Offer, Request, Acknowledge).',
          'Services',
        ),
      ],
      quiz: [
        q(
          'npq1',
          'At which OSI layer do switches primarily operate?',
          ['Layer 2 (Data Link)', 'Layer 3 (Network)', 'Layer 1 (Physical)', 'Layer 4 (Transport)'],
          0,
          'Switches forward frames using MAC addresses at Layer 2.',
        ),
        q(
          'npq2',
          'Which port does HTTPS use by default?',
          ['443', '80', '22', '8080'],
          0,
          'HTTPS (HTTP over TLS) defaults to TCP port 443.',
        ),
      ],
      labs: [],
    },
  },
  {
    id: 'starter-security-plus',
    title: 'CompTIA Security+ — Fundamentals',
    description:
      'Core security concepts (CIA triad, crypto, access control). Community starter deck — verify against the current official exam objectives.',
    data: {
      metadata: {
        title: 'CompTIA Security+ — Fundamentals',
        subject: 'Security',
        author: 'Dungeon Scholar (community starter)',
        description: 'Bedrock security fundamentals. Not official exam content — verify against current objectives.',
      },
      flashcards: [
        c(
          'sp1',
          'What is the CIA triad?',
          'Confidentiality (keep data private), Integrity (data is unaltered/trustworthy), Availability (data/systems are accessible when needed).',
          'Concepts',
        ),
        c(
          'sp2',
          'Symmetric vs asymmetric encryption?',
          'Symmetric uses one shared key for encrypt + decrypt (fast; e.g., AES). Asymmetric uses a public/private key pair (e.g., RSA); used for key exchange and digital signatures.',
          'Cryptography',
        ),
        c(
          'sp3',
          'What property does hashing provide, and is it reversible?',
          'Integrity — a fixed-length one-way fingerprint of data. It is not reversible (e.g., SHA-256).',
          'Cryptography',
        ),
        c(
          'sp4',
          'What is multi-factor authentication (MFA)?',
          'Authentication using two or more distinct factors: something you know, something you have, and/or something you are.',
          'Access Control',
        ),
        c(
          'sp5',
          'Define the principle of least privilege.',
          'Grant users and processes only the minimum access rights needed to perform their function, and no more.',
          'Access Control',
        ),
        c(
          'sp6',
          'What is phishing?',
          'A social-engineering attack that tricks a victim into revealing credentials or sensitive data, usually via deceptive email/messages impersonating a trusted source.',
          'Threats',
        ),
      ],
      quiz: [
        q(
          'spq1',
          'Which CIA principle does ransomware most directly attack?',
          ['Availability', 'Confidentiality', 'Integrity', 'Non-repudiation'],
          0,
          'Ransomware encrypts data to deny access, directly harming availability.',
        ),
        q(
          'spq2',
          'Which is an example of "something you have"?',
          ['A hardware security token', 'A password', 'A fingerprint', 'A PIN'],
          0,
          'A token/smart card is a possession factor; passwords/PINs are knowledge, fingerprints are inherence.',
        ),
      ],
      labs: [],
    },
  },
];
