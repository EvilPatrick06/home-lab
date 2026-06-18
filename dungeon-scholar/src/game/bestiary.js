
// === Bestiary (Phase 17) ================================================
// Lore + drop hints for every dungeon dweller. Boss entries carry tiered
// lore: base on first defeat, expanded after 5, and a secret line after
// 10. All entries are unlocked on first kill and counted in
// playerState.bestiary[kind] = { defeats: N, firstDefeatedAt: iso }.
export const BESTIARY_ENTRIES = {
  // === Crypt mobs ===
  wraith: {
    name: 'Wraith', icon: '👻', biome: 'crypt', tier: 'basic',
    lore: 'A spectral cryptanalyst who never finished her thesis on RC4. She drifts the catacombs murmuring the keystream that broke her.',
    drops: 'Glow Root · faint glimmers of gold',
  },
  skeleton: {
    name: 'Skeleton', icon: '💀', biome: 'crypt', tier: 'basic',
    lore: 'A sentry who fell guarding a server rack centuries past. Its bones still rattle the heartbeat of an obsolete IDS signature.',
    drops: 'Ember Ash · gold',
  },
  shade: {
    name: 'Shade', icon: '🟣', biome: 'crypt', tier: 'elite',
    lore: "A lich's apprentice — half-bound to the algorithms his master cracked. To fight him is to argue with a fragment of broken proof.",
    drops: 'Sigil Dust · Scholar\'s Brew (rare)',
  },
  // === Sewers mobs ===
  slime: {
    name: 'Slime', icon: '🟢', biome: 'sewers', tier: 'basic',
    lore: 'Born from the slow drip of an unsanitized parameter, it wears every payload it has ever swallowed.',
    drops: 'Glow Root · gold',
  },
  rat: {
    name: 'Sewer Rat', icon: '🐀', biome: 'sewers', tier: 'basic',
    lore: 'It has chewed through a hundred TLS handshakes to nest in this sewer. It knows where every stale session token sleeps.',
    drops: 'Moonleaf · gold',
  },
  ooze: {
    name: 'Ooze', icon: '🦠', biome: 'sewers', tier: 'elite',
    lore: 'A weaponised SQL injection given form. Three eyes, three statements, three ways to ruin thy day.',
    drops: 'Iron Filings · Shield Draught (rare)',
  },
  // === Tower mobs ===
  sentry: {
    name: 'Sentry', icon: '🛡️', biome: 'tower', tier: 'basic',
    lore: 'A defunct intrusion detector still running on stubborn firmware. It cannot be reasoned with, only outwitted.',
    drops: 'Iron Filings · gold',
  },
  drone: {
    name: 'Drone', icon: '🛸', biome: 'tower', tier: 'basic',
    lore: 'A reconnaissance scout from a long-decommissioned monitoring system. Its rotors hum with ancient packet captures.',
    drops: 'Crystal Shard · gold',
  },
  firewall: {
    name: 'Firewall', icon: '🔥', biome: 'tower', tier: 'elite',
    lore: 'A misconfigured perimeter given will. It blocks even truth, if the truth lacks the right ACL.',
    drops: 'Crystal Shard · Tinker\'s Oil (rare)',
  },
  // === Halls mobs ===
  spark: {
    name: 'Spark', icon: '⚡', biome: 'halls', tier: 'basic',
    lore: 'A wisp of static charge from a broken capacitor — drawn to anyone bearing fresh memory.',
    drops: 'Ember Ash · gold',
  },
  imp: {
    name: 'Imp', icon: '😈', biome: 'halls', tier: 'basic',
    lore: 'Mischievous BIOS-level malware fashioned into a winged shape.',
    drops: 'Cactus Pulp · Foresight Scroll (rare)',
  },
  sentinel: {
    name: 'Sentinel', icon: '🤖', biome: 'halls', tier: 'elite',
    lore: 'A hardened security appliance, animated by years of accumulated audit logs.',
    drops: 'Iron Filings · Phoenix Ember (very rare)',
  },
  // === Wastes mobs ===
  scorpion: {
    name: 'Scorpion', icon: '🦂', biome: 'wastes', tier: 'basic',
    lore: 'It dwells beneath the antennae, stinging signals with electromagnetic venom.',
    drops: 'Cactus Pulp · gold',
  },
  spider: {
    name: 'Spider', icon: '🕷️', biome: 'wastes', tier: 'basic',
    lore: 'It spins webs of social-engineered links between unwary travelers.',
    drops: 'Sigil Dust · gold',
  },
  elemental: {
    name: 'Sand Elemental', icon: '🌪️', biome: 'wastes', tier: 'elite',
    lore: 'A dust devil shaped by the broadcast prayers of forgotten radios.',
    drops: 'Crystal Shard · Phoenix Ember (rare)',
  },
  // === Bosses (tiered lore) ===
  lich: {
    name: 'The Lich', icon: '💀', biome: 'crypt', tier: 'boss',
    lore: {
      base: 'A skeletal sorcerer wreathed in violet flame, tethered to centuries of forbidden lore.',
      expanded: 'Once a brilliant cryptographer, he memorised every private key the world has ever forged. Each correct answer chips at the seal that binds him here.',
      secret: 'His true name is bound in his last unpublished paper, lost in the catacombs. Find that scroll and his binding breaks before the gauntlet ends.',
    },
    drops: 'Massive XP + gold on victory · titles · rare gear from boss-room Gold chests',
  },
  hydra: {
    name: 'The Hydra', icon: '🐉', biome: 'sewers', tier: 'boss',
    lore: {
      base: 'Three serpentine heads writhe in unison, fangs bared, breathing ruin.',
      expanded: 'It was born from a fork bomb that escaped a CTF lab. Each head is one of the spawned children, refusing to die.',
      secret: 'Cut off the parent process and the heads collapse — but no one alive remembers the PID.',
    },
    drops: 'Massive XP + gold on victory · Adept-tier titles · Silver/Gold chest pools',
  },
  sphinx: {
    name: 'The Sphinx', icon: '🦁', biome: 'tower', tier: 'boss',
    lore: {
      base: 'A regal beast whose patience is measured in falling sand.',
      expanded: 'It guards the route to a cache that holds the last legitimate session of every fallen scholar.',
      secret: 'Its riddle is itself — answer it not, and it answers thee. Speak the question aloud to undo the binding.',
    },
    drops: 'Massive XP + gold · Master-tier titles · Gold-chest gear seeds',
  },
  behemoth: {
    name: 'The Behemoth', icon: '🪨', biome: 'halls', tier: 'boss',
    lore: {
      base: 'A mountain of muscle and bone, scarred by ages of battle.',
      expanded: 'Bare-metal made flesh — the union of every server that refused to upgrade. It hits twice as hard but the punches are deterministic.',
      secret: 'Patch its kernel and it falls. The patch lives in a forgotten changelog, hidden behind seven Adept clears.',
    },
    drops: 'Massive XP + gold · Master-tier titles · Mythic seed chests',
  },
  riddler: {
    name: 'The Riddler', icon: '🃏', biome: 'wastes', tier: 'boss',
    lore: {
      base: 'A masked trickster who wagers the path on words alone.',
      expanded: 'He was a senior tester who solved every CTF before grading. None of his colleagues could prove a winner; none could prove a loser either.',
      secret: 'His mask is the flag — read it backwards. The reversal is engraved on the inside of the mask he never removes.',
    },
    drops: 'Massive XP + gold · Mythic-tier titles · Gold chest exclusives',
  },
};
