import { z } from "zod";

const DiceExpression = z.object({
  count: z.number().int().min(1).describe("Number of dice rolled"),
  die: z.number().int().refine((v) => [4, 6, 8, 10, 12, 20, 100].includes(v), {
    message: "Die must be a standard die type: d4, d6, d8, d10, d12, d20, d100",
  }),
  modifier: z.number().int().default(0),
  expression: z.string().regex(/^\d+d\d+([+-]\d+)?$/, "Must be a valid dice expression e.g. 2d10+5"),
  averageResult: z.number().describe("Mathematical expectation: count * (die + 1) / 2 + modifier"),
});

const DamageType = z.enum([
  "Acid",
  "Bludgeoning",
  "Cold",
  "Fire",
  "Force",
  "Lightning",
  "Necrotic",
  "Piercing",
  "Poison",
  "Psychic",
  "Radiant",
  "Slashing",
  "Thunder",
]);

const AbilityScore = z.enum([
  "Strength",
  "Dexterity",
  "Constitution",
  "Intelligence",
  "Wisdom",
  "Charisma",
]);

const ConditionType = z.enum([
  "Blinded",
  "Charmed",
  "Deafened",
  "Exhaustion",
  "Frightened",
  "Grappled",
  "Incapacitated",
  "Invisible",
  "Paralyzed",
  "Petrified",
  "Poisoned",
  "Prone",
  "Restrained",
  "Stunned",
  "Unconscious",
]);

const CreatureSize = z.enum(["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"]);

const Alignment = z.enum([
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
]);

const DamagePerTurn = z.object({
  dice: DiceExpression,
  damageType: DamageType,
  averageDamagePerTurn: z.number().min(0).describe("Expected damage output per applicable time interval"),
  frequency: z.enum([
    "per_round",
    "per_minute",
    "per_hour",
    "per_long_rest",
    "on_entry",
    "on_exit",
    "continuous",
    "on_trigger",
  ]),
  frequencyDescription: z.string().optional(),
  triggerCondition: z.string().optional().describe("Conditions under which damage is applied"),
  resistanceFactor: z.number().min(0).max(1).default(0.5).describe("Multiplier when resistance applies"),
  savingThrowForHalf: z
    .object({
      ability: AbilityScore,
      dc: z.number().int().min(1).max(30),
      onSuccess: z.enum(["no_damage", "half_damage", "reduced_effect"]),
      onFailure: z.string().default("full damage"),
    })
    .optional(),
  immunityNegates: z
    .object({
      damageTypeImmunity: DamageType.optional(),
      creatureTypes: z.array(z.string()).optional(),
      traits: z.array(z.string()).optional(),
    })
    .optional(),
  cumulativeDamageModel: z
    .object({
      escalates: z.boolean().default(false),
      escalationFormula: z.string().optional().describe("Formula describing how damage increases per interval"),
      maxDamagePerTurn: z.number().optional(),
    })
    .optional(),
  effectiveRoundsToIncapacitate: z
    .object({
      averageHPAssumption: z.number().int().min(1),
      estimatedRounds: z.number().min(0),
    })
    .optional()
    .describe("Mathematical estimate of rounds until an average creature is incapacitated"),
});

const SavingThrowRequirement = z.object({
  ability: AbilityScore,
  dc: z.number().int().min(1).max(30),
  proficiencyApplies: z.boolean().default(true),
  trigger: z.enum([
    "on_entry",
    "per_round",
    "per_minute",
    "per_hour",
    "per_long_rest",
    "on_exit",
    "on_interaction",
    "on_kill",
    "situational",
    "per_day",
  ]),
  triggerDescription: z.string().optional(),
  onFailure: z.object({
    description: z.string(),
    conditionApplied: ConditionType.optional(),
    customCondition: z.string().optional().describe("Non-standard condition like Shapeshifted, Despair, Memory Loss, Transformation"),
    exhaustionLevels: z.number().int().min(0).max(6).default(0),
    exhaustionIsRemovable: z.boolean().default(true),
    duration: z.string().optional(),
    durationRounds: z.number().int().optional().describe("Duration in combat rounds if applicable"),
    durationHours: z.number().optional().describe("Duration in hours if applicable"),
    cumulative: z.boolean().default(false),
    cumulativeMaxStacks: z.number().int().optional(),
    cumulativeDescription: z.string().optional(),
    penaltyDice: z
      .object({
        dice: DiceExpression,
        appliesTo: z.enum([
          "d20_tests",
          "saving_throws",
          "attack_rolls",
          "ability_checks",
          "initiative",
          "death_saves",
          "all",
        ]),
        subtracted: z.boolean().default(true).describe("True if dice are subtracted from roll"),
      })
      .optional(),
    terminalEffect: z.string().optional().describe("Effect when max cumulation reached, e.g. 'transforms into Larva'"),
    terminalAtExhaustionLevel: z.number().int().min(1).max(6).optional(),
    damageOnFailure: DamagePerTurn.optional(),
    preventsDeath: z.boolean().default(false).describe("True if terminal transformation prevents actual death"),
  }),
  onSuccess: z.object({
    description: z.string(),
    endsEffect: z.boolean().default(false),
    partialEffect: z.string().optional(),
  }),
  autoSuccessCreatureTypes: z.array(z.string()).default([]).describe("Creature types that automatically succeed"),
  autoSuccessTraits: z.array(z.string()).default([]).describe("Traits that grant auto-success, e.g. Fey Ancestry"),
  autoSuccessConditions: z.array(z.string()).default([]).describe("Other conditions granting auto-success"),
  repeatSaveAllowed: z.boolean().default(false),
  repeatSaveTiming: z.string().optional().describe("When the repeat save occurs, e.g. 'end of each turn'"),
  recoveryDC: z.number().int().min(1).max(30).optional().describe("DC for recovery save if different from initial"),
  recoveryTrigger: z.string().optional().describe("When recovery save is attempted"),
  recoveryMethods: z.array(z.string()).default([]).describe("Spells or methods that can cure the effect"),
  maxFailuresBeforePermanent: z.number().int().optional(),
  failureProbabilityAtDC: z
    .object({
      dc: z.number().int(),
      noModifierFailChance: z.number().min(0).max(1).describe("Probability of failure with +0 modifier"),
      commonModifierRange: z.object({
        low: z.number().int(),
        high: z.number().int(),
      }),
      failChanceAtLowMod: z.number().min(0).max(1),
      failChanceAtHighMod: z.number().min(0).max(1),
    })
    .optional()
    .describe("Statistical probability model for save failure rates"),
});

const LightLevelModification = z.object({
  baseLevel: z.enum([
    "blinding_radiance",
    "bright_light",
    "dim_light",
    "darkness",
    "magical_darkness",
    "variable",
    "no_natural_light",
  ]),
  naturalLightSource: z.string().nullable().describe("Description of light source, null if none"),
  visibilityRange: z.object({
    standard: z.number().min(0).nullable().describe("Standard visibility in feet, null for unlimited"),
    withDarkvision: z.number().min(0).nullable().optional(),
    inBorderRegion: z.number().min(0).nullable().optional(),
    minimumVisibility: z.number().min(0).default(0),
    unit: z.enum(["feet", "miles"]).default("feet"),
  }),
  magicalProperties: z
    .object({
      extinguishesNonmagicalFlames: z.boolean().default(false),
      extinguishesMagicalFlames: z.boolean().default(false),
      suppressesDarkvision: z.boolean().default(false),
      obscuresVision: z.boolean().default(false),
      obscuringMedium: z.string().optional().describe("e.g. ash, fog, mist, snow"),
      absorbsLight: z.boolean().default(false).describe("e.g. Phlegethon in Pandemonium"),
      radiatesEnergy: z.boolean().default(false),
      radiationDamageType: DamageType.optional(),
    })
    .default({}),
  dayNightCycle: z.object({
    exists: z.boolean(),
    periodHours: z.number().min(0).optional().describe("Total cycle period in hours"),
    lightPhaseDuration: z.number().min(0).optional().describe("Duration of light phase in hours"),
    darkPhaseDuration: z.number().min(0).optional().describe("Duration of dark phase in hours"),
    transitionType: z.enum(["gradual", "instant", "orbital", "none"]).default("none"),
    description: z.string().optional(),
    peakIntensity: z.string().optional().describe("e.g. 'white hot at noon'"),
    minimumIntensity: z.string().optional().describe("e.g. 'deep red at midnight'"),
  }),
  effectOnConversation: z
    .object({
      maxConversationDistanceFeet: z.number().int().min(0).optional(),
      requiresYelling: z.boolean().default(false),
      reason: z.string().optional(),
    })
    .optional(),
  colorDescription: z.string().optional().describe("Overall color tint of the plane's light"),
  illuminationModifierPercent: z.number().min(-100).max(1000).default(0).describe("Percentage modifier to ambient light, -100 = total darkness, 0 = normal"),
});

const MovementSpeedPenalty = z.object({
  type: z.enum([
    "none",
    "multiplier",
    "flat_reduction",
    "speed_override",
    "no_walking",
    "thought_based",
    "gravity_alteration",
    "difficult_terrain",
    "impossible_terrain",
    "inclined_terrain",
  ]),
  multiplier: z.number().min(0).max(10).optional().describe("Speed multiplier, e.g. 0.5 for half speed"),
  flatReductionFeet: z.number().int().min(0).optional(),
  overrideSpeed: z
    .object({
      formula: z.string().describe("Formula for speed, e.g. '5 * Intelligence score'"),
      multiplierAbility: AbilityScore.optional().describe("Ability score used as multiplier"),
      multiplierCoefficient: z.number().optional().describe("Coefficient applied to ability score"),
      baseSpeedFeet: z.number().min(0).optional(),
      movementType: z.enum(["walk", "fly", "swim", "climb", "burrow", "hover"]),
      canHover: z.boolean().default(false),
    })
    .optional(),
  affectedMovementTypes: z.array(z.enum(["walk", "fly", "swim", "climb", "burrow", "all"])).default(["all"]),
  unaffectedMovementTypes: z.array(z.enum(["walk", "fly", "swim", "climb", "burrow"])).default([]),
  gravityModel: z.object({
    type: z.enum([
      "normal",
      "none",
      "variable",
      "subjective",
      "toward_nearest_surface",
      "reversed",
      "multiple_surfaces",
      "thought_directed",
    ]).default("normal"),
    description: z.string().optional(),
    affectsFloatingObjects: z.boolean().default(false),
    driftSpeed: z.string().optional().describe("Speed at which unsecured objects drift"),
  }),
  terrainIncline: z
    .object({
      angleDegrees: z.number().min(0).max(90),
      isPervasive: z.boolean().default(false).describe("Whether the incline affects the entire plane"),
      climbingRequired: z.boolean().default(false),
      climbDC: z.number().int().min(0).max(30).optional(),
      fallRisk: z.boolean().default(false),
      fallDamageDice: DiceExpression.optional(),
    })
    .optional(),
  hazardousTerrainPercentage: z.number().min(0).max(100).optional().describe("Estimated percentage of terrain that is hazardous"),
  effectiveSpeedReductionPercent: z.number().min(-100).max(100).default(0).describe("Net percentage reduction to effective movement speed, negative means faster"),
  windForce: z
    .object({
      category: z.enum(["calm", "light", "moderate", "strong", "severe", "hurricane", "variable"]),
      speedMph: z.number().min(0).optional(),
      opposesMovement: z.boolean().default(false),
      pushForce: z.number().int().min(0).optional().describe("Feet pushed per round against movement"),
      saveDCToResist: z.number().int().min(0).max(30).optional(),
    })
    .optional(),
  distanceMeaningless: z.boolean().default(false).describe("True for planes where distance is subjective"),
  travelTimeModel: z
    .object({
      formula: z.string().optional().describe("Dice formula for travel time, e.g. '1d10 × 10 hours'"),
      dice: DiceExpression.optional(),
      multiplierHours: z.number().optional(),
      isDeterministic: z.boolean().default(true),
      subjectToWill: z.boolean().default(false),
    })
    .optional(),
});

const InteractionCheck = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  checkType: z.enum(["ability_check", "saving_throw", "contested_check", "passive_perception", "magic_action_check"]),
  ability: AbilityScore,
  skill: z.string().optional().describe("Associated skill if applicable, e.g. Arcana, Survival"),
  baseDC: z.number().int().min(1).max(30),
  actionCost: z.enum(["action", "bonus_action", "reaction", "magic_action", "free_action", "no_action", "passive"]),
  scalingDCs: z
    .object({
      bySize: z.record(CreatureSize, z.number().int().min(1).max(30)).optional(),
      byDistance: z.array(z.object({
        rangeFeet: z.number().min(0),
        dc: z.number().int().min(1).max(30),
      })).optional(),
      byComplexity: z.record(z.string(), z.number().int().min(1).max(30)).optional(),
    })
    .optional(),
  onSuccess: z.object({
    description: z.string(),
    movementGrantedFeet: z.number().int().min(0).optional().describe("Base movement on success"),
    bonusMovementFormula: z.string().optional().describe("Additional movement = total - DC"),
    durationHours: z.number().min(0).optional(),
    durationRounds: z.number().int().min(0).optional(),
    stabilizesArea: z.boolean().default(false),
    stabilizationRadiusFeet: z.number().int().min(0).optional(),
    transformsObject: z.boolean().default(false),
    transformationConstraints: z.string().optional(),
  }),
  onFailure: z.object({
    description: z.string(),
    damageOnFailure: DamagePerTurn.optional(),
    conditionOnFailure: ConditionType.optional(),
    noEffect: z.boolean().default(true),
  }),
  repeatable: z.boolean().default(true),
  cooldown: z.string().optional().describe("Minimum time between attempts"),
  requiresConcentration: z.boolean().default(false),
  endsOnConcentrationBreak: z.boolean().default(false),
  successProbabilityModel: z
    .object({
      atModifierZero: z.number().min(0).max(1),
      atModifierFive: z.number().min(0).max(1),
      atModifierTen: z.number().min(0).max(1),
    })
    .optional()
    .describe("Probability of success at various modifier levels"),
});

const PlanarPortal = z.object({
  id: z.string(),
  type: z.enum([
    "doorway",
    "location",
    "vortex",
    "color_pool",
    "fey_crossing",
    "shadow_crossing",
    "ethereal_curtain",
    "gate_town",
    "natural",
    "magical",
    "permanent",
    "temporary",
  ]),
  name: z.string().optional(),
  destination: z.string(),
  destinationPlane: z.string(),
  bidirectional: z.boolean().default(true),
  requirement: z
    .object({
      type: z.enum(["command", "key_item", "random", "situation", "time", "none"]),
      description: z.string().optional(),
      commandWord: z.string().optional(),
      keyItem: z.string().optional(),
      randomDuration: z.string().optional().describe("Dice formula for open/close duration"),
      situationCondition: z.string().optional(),
      timeTrigger: z.string().optional(),
    })
    .optional(),
  colorOrAppearance: z.string().optional(),
  sizeRange: z
    .object({
      formula: z.string().optional().describe("e.g. '1d6 × 10 feet in diameter'"),
      minFeet: z.number().min(0).optional(),
      maxFeet: z.number().min(0).optional(),
    })
    .optional(),
  guardian: z
    .object({
      creatureType: z.string().optional(),
      creatureName: z.string().optional(),
      challengeRating: z.number().optional(),
    })
    .optional(),
  isDetectable: z.boolean().default(true),
  detectionDC: z.number().int().min(0).max(30).optional(),
});

const PlaneLayer = z.object({
  name: z.string().min(1),
  alternateNames: z.array(z.string()).default([]),
  layerNumber: z.number().int().min(1).optional(),
  layerNumberRange: z
    .object({
      start: z.number().int().min(1),
      end: z.number().int().min(1),
    })
    .optional()
    .describe("For layers spanning multiple numbers like Azzagrat 45-47"),
  description: z.string(),
  notableLocations: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        ruler: z.string().optional(),
      })
    )
    .default([]),
  notableInhabitants: z.array(z.string()).default([]),
  ruler: z
    .object({
      name: z.string(),
      title: z.string().optional(),
      creatureType: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
  layerSpecificHazards: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        damagePerTurn: DamagePerTurn.optional(),
        savingThrow: SavingThrowRequirement.optional(),
        lightModification: LightLevelModification.optional(),
        movementPenalty: MovementSpeedPenalty.optional(),
      })
    )
    .default([]),
  lightLevel: LightLevelModification.optional(),
  movementPenalty: MovementSpeedPenalty.optional(),
  environmentalDescription: z.string().optional(),
  isArrivalLayer: z.boolean().default(false).describe("True if this is the default arrival layer for visitors"),
});

const PlanarConnection = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["river", "staircase", "world_tree", "portal_network", "psychic_wind", "ether_cyclone", "other"]),
  connectedPlanes: z.array(z.string()),
  description: z.string(),
  hazards: z.array(z.string()).default([]),
  travelTime: z
    .object({
      formula: z.string().optional(),
      dice: DiceExpression.optional(),
      unitMultiplier: z.string().optional().describe("e.g. 'hours', 'days'"),
    })
    .optional(),
  isOneWay: z.boolean().default(false),
  navigableBy: z.array(z.string()).default([]).describe("Types of vessels or methods that can navigate this connection"),
});

const TimeFlowModel = z.object({
  type: z.enum(["normal", "faster", "slower", "variable", "stopped", "subjective", "none", "distorted"]),
  ratioToMaterialPlane: z.string().optional().describe("e.g. '1:1', 'variable', 'subjective'"),
  agingOccurs: z.boolean().default(true),
  hungerThirstApplies: z.boolean().default(true),
  warpTable: z
    .array(
      z.object({
        diceRangeLow: z.number().int().min(1),
        diceRangeHigh: z.number().int().min(1),
        result: z.string(),
        effectDescription: z.string(),
      })
    )
    .optional(),
  warpDie: z.number().int().optional().describe("Die used for time warp table, e.g. 20 for d20"),
  description: z.string().optional(),
});

const EnvironmentalEffect = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  mechanicalEffect: z.string(),
  isOptional: z.boolean().default(false).describe("True if DM chooses when to apply"),
  damagePerTurn: DamagePerTurn.optional(),
  savingThrow: SavingThrowRequirement.optional(),
  lightModification: LightLevelModification.optional(),
  movementPenalty: MovementSpeedPenalty.optional(),
  interactionCheck: InteractionCheck.optional(),
  affectsEmotions: z.boolean().default(false),
  emotionalEffect: z.string().optional(),
  duration: z.string().optional(),
  removalMethods: z.array(z.string()).default([]),
  sourceReference: z.string().optional().describe("Reference to chapter 3 or other source"),
});

const PlaneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  alternateNames: z.array(z.string()).default([]),
  category: z.enum([
    "Material Realm",
    "Transitive Plane",
    "Inner Plane",
    "Para-elemental Plane",
    "Outer Plane",
    "Positive Negative Plane",
    "Demiplane",
    "Far Realm",
    "Special",
  ]),
  subcategory: z
    .enum([
      "Material Plane",
      "Feywild",
      "Shadowfell",
      "Ethereal",
      "Astral",
      "Elemental Air",
      "Elemental Earth",
      "Elemental Fire",
      "Elemental Water",
      "Para-elemental Ash",
      "Para-elemental Ice",
      "Para-elemental Magma",
      "Para-elemental Ooze",
      "Upper Plane",
      "Lower Plane",
      "Neutral Plane",
      "Positive",
      "Negative",
      "Demiplane",
      "Far Realm",
      "Planar City",
    ])
    .optional(),

  alignments: z.array(Alignment).default([]),
  philosophicalEssence: z.string().optional(),
  emotionalInfluence: z.string().optional(),

  physicalProperties: z.object({
    hasGravity: z.boolean(),
    gravityType: z
      .enum([
        "normal",
        "none",
        "subjective",
        "variable",
        "toward_nearest_surface",
        "multiple_surfaces",
        "thought_based",
      ])
      .default("normal"),
    isBounded: z.boolean().default(false),
    isInfinite: z.boolean().default(true),
    morphic: z
      .enum(["static", "mutable", "highly_morphic", "sentient_responsive", "divinely_morphic", "magically_morphic"])
      .default("static"),
    shape: z.string().optional(),
    breathableAtmosphere: z.boolean().default(true),
    atmosphereNotes: z.string().optional(),
    temperature: z
      .object({
        category: z.enum(["frigid", "cold", "temperate", "warm", "hot", "extreme_heat", "extreme_cold", "variable", "layered"]),
        fahrenheitEstimate: z
          .object({
            low: z.number().optional(),
            high: z.number().optional(),
          })
          .optional(),
        description: z.string().optional(),
      })
      .optional(),
    hasSurface: z.boolean().default(true),
    dominantElement: z.string().optional(),
    weatherPatterns: z.string().optional(),
  }),

  layers: z.array(PlaneLayer).default([]),
  hasDistinctLayers: z.boolean().default(false),
  layerCount: z
    .union([z.number().int().min(1), z.literal("infinite"), z.literal("unknown"), z.literal("none")])
    .default("none"),

  timeFlow: TimeFlowModel.default({ type: "normal" }),

  hazards: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        category: z.enum([
          "environmental",
          "psychic",
          "magical",
          "physical",
          "elemental",
          "necrotic",
          "radiant",
          "planar_trait",
          "weather",
          "corruption",
          "emotional",
          "temporal",
          "gravitational",
          "sonic",
        ]),
        severity: z.enum(["trivial", "minor", "moderate", "major", "severe", "lethal"]),

        damagePerTurn: DamagePerTurn.optional(),

        savingThrowToTraverse: SavingThrowRequirement.optional(),

        lightLevelModification: LightLevelModification.optional(),

        movementSpeedPenalty: MovementSpeedPenalty.optional(),

        interactionCheck: InteractionCheck.optional(),

        affectsCreatureTypes: z.array(z.string()).optional().describe("If set, only these types are affected"),
        immuneCreatureTypes: z.array(z.string()).default([]),
        immuneDamageTypes: z.array(DamageType).default([]),
        immuneTraits: z.array(z.string()).default([]),

        areaOfEffect: z
          .object({
            shape: z.enum(["sphere", "cube", "cone", "line", "cylinder", "plane_wide", "layer_wide", "localized"]),
            radiusFeet: z.number().min(0).optional(),
            lengthFeet: z.number().min(0).optional(),
            widthFeet: z.number().min(0).optional(),
            heightFeet: z.number().min(0).optional(),
            isPlaneWide: z.boolean().default(false),
          })
          .optional(),

        detectionMethod: z
          .object({
            passivePerceptionDC: z.number().int().min(0).max(30).optional(),
            warningTimeMinutes: z.number().min(0).optional(),
            warningDescription: z.string().optional(),
          })
          .optional(),

        locationTableRoll: z
          .object({
            die: z.number().int(),
            entries: z.array(
              z.object({
                rangeLow: z.number().int().min(1),
                rangeHigh: z.number().int().min(1),
                effect: z.string(),
                description: z.string(),
              })
            ),
          })
          .optional()
          .describe("Random table for location or navigation effects"),

        psychicEffectTableRoll: z
          .object({
            die: z.number().int(),
            entries: z.array(
              z.object({
                rangeLow: z.number().int().min(1),
                rangeHigh: z.number().int().min(1),
                effect: z.string(),
                damage: DiceExpression.optional(),
                damageType: DamageType.optional(),
                conditionApplied: ConditionType.optional(),
                durationDescription: z.string().optional(),
              })
            ),
          })
          .optional()
          .describe("Random table for psychic or mental effects"),

        encounterProbability: z
          .object({
            perDay: z.number().min(0).max(1).optional(),
            perHour: z.number().min(0).max(1).optional(),
            description: z.string().optional(),
          })
          .optional(),

        narrativeWeight: z.enum(["flavor", "mechanical", "both"]).default("both"),
        sourceReference: z.string().optional(),
      })
    )
    .default([]),

  environmentalEffects: z.array(EnvironmentalEffect).default([]),

  portals: z.array(PlanarPortal).default([]),
  portalFrequency: z.enum(["none", "extremely_rare", "rare", "uncommon", "common", "abundant"]).default("rare"),

  planarConnections: z.array(PlanarConnection).default([]),

  inhabitants: z
    .object({
      primaryCreatureTypes: z.array(z.string()).default([]),
      notableEntities: z
        .array(
          z.object({
            name: z.string(),
            title: z.string().optional(),
            creatureType: z.string().optional(),
            alignment: Alignment.optional(),
            description: z.string().optional(),
            rulesLayer: z.string().optional(),
            rulesLocation: z.string().optional(),
          })
        )
        .default([]),
      civilizations: z
        .array(
          z.object({
            name: z.string(),
            race: z.string().optional(),
            description: z.string().optional(),
            location: z.string().optional(),
          })
        )
        .default([]),
    })
    .default({}),

  specialRules: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        mechanicalEffect: z.string(),
        savingThrow: SavingThrowRequirement.optional(),
        interactionCheck: InteractionCheck.optional(),
        affectsSpellcasting: z.boolean().default(false),
        spellcastingRestrictions: z
          .object({
            blockedSpells: z.array(z.string()).default([]),
            exemptSpells: z.array(z.string()).default([]),
            modifiedSpells: z
              .array(
                z.object({
                  spell: z.string(),
                  modification: z.string(),
                })
              )
              .default([]),
          })
          .optional(),
      })
    )
    .default([]),

  resurrectionRule: z
    .object({
      enabled: z.boolean(),
      timing: z.string().describe("e.g. 'dawn the next day'"),
      fullHPRestored: z.boolean(),
      conditionsRemoved: z.boolean(),
      excludedCreatureTypes: z.array(z.string()),
      requirement: z.string().optional().describe("e.g. 'killed in combat'"),
    })
    .optional(),

  prisonRules: z
    .object({
      isPrisonPlane: z.boolean(),
      escapeMethods: z.array(z.string()),
      blockedSpells: z.array(z.string()),
      exemptSpells: z.array(z.string()),
      portalBehavior: z.string().optional(),
      escapeRequirement: z.string().optional(),
    })
    .optional(),

  planarDissonance: z
    .object({
      applies: z.boolean(),
      affectedCreatureTypes: z.array(z.string()),
      savingThrow: SavingThrowRequirement.optional(),
      description: z.string().optional(),
    })
    .optional(),

  domainsOrRegions: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.enum(["Domain of Delight", "Domain of Dread", "Gate-town", "Region", "City", "Realm"]),
        ruler: z
          .object({
            name: z.string(),
            title: z.string().optional(),
            description: z.string().optional(),
          })
          .optional(),
        description: z.string(),
        hazards: z.array(z.string()).default([]),
        portalDestination: z.string().optional(),
      })
    )
    .default([]),

  adventureThemes: z.array(z.string()).default([]),
  suggestedLevelRange: z
    .object({
      min: z.number().int().min(1).max(20),
      max: z.number().int().min(1).max(20),
    })
    .optional(),

  adventureSituations: z
    .array(
      z.object({
        diceValue: z.number().int().min(1),
        situation: z.string(),
      })
    )
    .default([]),

  colorPoolColor: z.string().optional().describe("Color of Astral color pool leading to this plane"),
  etherealCurtainColor: z.string().optional().describe("Color of Ethereal curtain leading to this plane"),

  sourceBook: z.string().default("Dungeon Master's Guide 2024"),
  chapter: z.string().default("Chapter 6: Cosmology"),
  crossReferences: z
    .array(
      z.object({
        book: z.string(),
        description: z.string(),
      })
    )
    .default([]),
});

const CosmologyModel = z.object({
  name: z.string().default("The Great Wheel"),
  description: z.string(),
  alternateConfigurations: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
      })
    )
    .default([]),
  planeCategories: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      memberPlanes: z.array(z.string()),
    })
  ),
});

const BloodWar = z.object({
  description: z.string(),
  primaryBattlefields: z.array(z.string()),
  factions: z.array(
    z.object({
      name: z.string(),
      planeOfOrigin: z.string(),
      creatureType: z.string(),
      role: z.string(),
    })
  ),
  spilloverPlanes: z.array(z.string()),
  adventureImplications: z.string().optional(),
});

const PlanarTravelMethod = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["portal", "spell", "planar_pathway", "natural_crossing", "nexus_point", "dream", "voyage", "other"]),
  description: z.string(),
  requirements: z.array(z.string()).default([]),
  associatedSpells: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  destinations: z.array(z.string()).default([]),
});

const InfernalHierarchyEntry = z.object({
  rank: z.number().int().min(1),
  title: z.string(),
  category: z.enum(["Least Devils", "Lesser Devils", "Greater Devils", "Archdevils"]),
  creatureType: z.string(),
  canPromoteTo: z.array(z.string()).default([]),
  canDemoteTo: z.array(z.string()).default([]),
  promotionAuthority: z.string().optional(),
  demotionAuthority: z.string().optional(),
});

const AstralColorPoolEntry = z.object({
  diceRangeLow: z.number().int().min(1).max(20),
  diceRangeHigh: z.number().int().min(1).max(20),
  plane: z.string(),
  poolColor: z.string(),
});

const EtherealCurtainEntry = z.object({
  diceRangeLow: z.number().int().min(1).max(12),
  diceRangeHigh: z.number().int().min(1).max(12),
  plane: z.string(),
  curtainColor: z.string(),
});

export const WorldSchema = z.object({
  schemaVersion: z.string().default("2024.1.0"),
  system: z.literal("DnD2024"),
  domain: z.literal("Cosmology"),

  cosmology: CosmologyModel,

  planes: z.array(PlaneSchema).min(1),

  globalPlanarConnections: z.array(PlanarConnection).default([]),

  bloodWar: BloodWar.optional(),

  planarTravelMethods: z.array(PlanarTravelMethod).default([]),

  infernalHierarchy: z.array(InfernalHierarchyEntry).default([]),

  astralColorPools: z.array(AstralColorPoolEntry).default([]),

  etherealCurtains: z.array(EtherealCurtainEntry).default([]),

  planarAdventureSituations: z
    .array(
      z.object({
        diceValue: z.number().int().min(1).max(10),
        situation: z.string(),
        suggestedMinLevel: z.number().int().min(1).max(20).default(11),
      })
    )
    .default([]),

  globalPlanarDissonance: z.object({
    description: z.string(),
    affectedCreatureTypes: z.array(z.string()),
    savingThrow: SavingThrowRequirement,
    planesCausingDissonance: z.object({
      forCelestials: z.array(z.string()),
      forFiends: z.array(z.string()),
    }),
  }).optional(),

  mathematicalConstants: z.object({
    standardDCScale: z.object({
      veryEasy: z.literal(5),
      easy: z.literal(10),
      medium: z.literal(15),
      hard: z.literal(20),
      veryHard: z.literal(25),
      nearlyImpossible: z.literal(30),
    }),
    astralMovementFormula: z.object({
      description: z.literal("Fly Speed (ft) = 5 × Intelligence score"),
      coefficient: z.literal(5),
      abilityScore: z.literal("Intelligence"),
      canHover: z.literal(true),
    }),
    limboObjectManipulationDCs: z.object({
      move: z.record(CreatureSize, z.number().int()),
      alter: z.record(CreatureSize, z.number().int()),
      stabilize: z.object({
        dc: z.number().int(),
        radiusFeet: z.number().int(),
        durationHours: z.number().int(),
      }),
      moveBonusFormula: z.literal("5 + (check total - DC) feet"),
    }),
    exhaustionThreshold: z.object({
      maxLevels: z.literal(6),
      deathAtMax: z.boolean(),
      transformationAtMax: z.boolean().optional(),
      transformationPlane: z.string().optional(),
    }),
    savingThrowProbabilities: z.object({
      dcTenFailRateNoMod: z.number().min(0).max(1).describe("P(fail) = (DC-1)/20 for uniform d20"),
      dcFifteenFailRateNoMod: z.number().min(0).max(1),
      dcTwentyFailRateNoMod: z.number().min(0).max(1),
      formula: z.literal("P(fail | modifier m) = max(0.05, min(0.95, (DC - 1 - m) / 20))"),
    }),
    averageDamageFormula: z.literal("avg = count × (die + 1) / 2 + modifier"),
  }),

  metadata: z.object({
    sourceBook: z.literal("Dungeon Master's Guide 2024"),
    chapter: z.literal("Chapter 6: Cosmology"),
    totalPlanesDescribed: z.number().int().min(1),
    lastUpdated: z.string().datetime(),
  }),
});