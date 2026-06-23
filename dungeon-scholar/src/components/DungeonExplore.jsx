// Dungeon Delve — top-down RPG view that replaces the old wave-based delve.
// Player walks the world; bumping into mobs opens a battle modal that asks
// a question from the active tome. Correct = mob defeated. Wrong = -1 HP.
// Reach the boss room and survive its 5-question gauntlet to win the run.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { startBgm, stopBgm, playSfx } from '../audio/sound.js';
import { petLevelFromXp } from '../services/pets.js';
import { POTION_EFFECTS, takeForesightPreview, TILE, BIOMES, pickBiomeForSubject, ROOMS_BY_DIFFICULTY, SIZE_BY_DIFFICULTY, DIFF_CONFIG, BIOME_BOSS_POOL, makeSeededRng, generateMap, revealDecoration, buildQuestionLogEntry, MOB_AGGRO_RANGE } from '../game/dungeonMap.js';
import { TILE_PX, drawTile, drawChest, drawPlayer, drawWeapon, DECO_DRAWERS, MOB_DRAWERS, BOSS_DRAWERS, BOSS_DISPLAY, PET_DRAWERS } from './dungeon/tileRenderer.js';

// === Equipment effects ==================================================
// In-dungeon stat bonuses for equipped items. Items live in App.jsx ITEMS;
// these effects apply only inside the delve.
const EQUIP_EFFECTS = {
  iron_circlet:    { maxHpBonus: 1 },
  silver_circlet:  { maxHpBonus: 1, shieldBonus: 1 },
  starbound_cloak: { firstWrongFree: true },
  oaken_blade:     { mobScoreBonus: 1 },
  gilded_sabre:    { goldMul: 1.5 },
  arcane_grimoire: { xpMul: 1.25 },
};

// === Potion effects =====================================================
// Quick-slotted potion behaviors when used inside the dungeon. Exported for tests (17G).
const SPELL_INFO = {
  glyph_of_mending: { icon: '✨', name: 'Glyph of Mending', cost: 2 },
  lance_of_lumens:  { icon: '⚡', name: 'Lance of Lumens',  cost: 3 },
  ward_of_aegis:    { icon: '🛡️', name: 'Ward of Aegis',    cost: 2 },
  bolt_of_truth:    { icon: '📖', name: 'Bolt of Truth',    cost: 3 },
  riftstep:         { icon: '🌀', name: 'Riftstep',         cost: 2 },
  sigil_of_clarity: { icon: '👁️', name: 'Sigil of Clarity', cost: 1 },
};

// 25c: stat-summary helper for the setup-screen Loadout dropdowns. Pulls
// the active EQUIP_EFFECTS row and renders it as a one-line tag string
// like "+1 HP · +1 shield". Returns the item's description as a fallback
// when the item has no measurable effect (cosmetic / lore-only).
const EQUIP_STAT_LABEL = {
  maxHpBonus:     (n) => `+${n} HP`,
  shieldBonus:    (n) => `+${n} shield`,
  xpMul:          (m) => m > 1 ? `+${Math.round((m - 1) * 100)}% XP` : '',
  goldMul:        (m) => m > 1 ? `+${Math.round((m - 1) * 100)}% gold` : '',
  mobScoreBonus:  (n) => `+${n} score per foe`,
  firstWrongFree: (b) => b ? 'absorbs first wrong' : '',
};
const summarizeEquipItem = (itemId) => {
  const eff = EQUIP_EFFECTS[itemId];
  if (!eff) return '';
  return Object.entries(eff)
    .map(([k, v]) => (EQUIP_STAT_LABEL[k] ? EQUIP_STAT_LABEL[k](v) : ''))
    .filter(Boolean)
    .join(' · ');
};
const summarizePetPassive = (def, level) => {
  if (!def) return '';
  const value = (def.base || 0) + (def.perLevel || 0) * (level - 1);
  switch (def.passive) {
    case 'xp_pct':           return `+${value}% XP`;
    case 'gold_pct':          return `+${value}% gold`;
    case 'shield_bonus':      return `+${value} shield`;
    case 'plant_double_pct':  return `${value}% plant double`;
    case 'first_wrong_free':  return 'absorbs first wrong';
    case 'mob_score':         return `+${value} score per foe`;
    default:                  return '';
  }
};

// 25c: shared dropdown card for the setup-screen Loadout panel. Used for
// gear slots, the pet slot, potion slots, and spell slots — all share
// the same visual card (label + icon, native <select>, optional summary
// line below). Disabled mode keeps the card visible for pure-display
// callers without a write path.
function LoadoutSelect({ label, icon, currentId, items, onChange, emptyLabel, summary, disabled }) {
  const has = !!currentId;
  return (
    <div className="p-2 rounded-sm" style={{
      background: 'rgba(0,0,0,0.35)',
      border: `1px solid ${has ? 'rgba(245,158,11,0.55)' : 'rgba(var(--surface-amber-strong, 120, 53, 15),0.3)'}`,
    }}>
      <div className="text-[10px] uppercase italic text-amber-700 flex items-center gap-1">
        <span>{icon}</span><span>{label}</span>
      </div>
      <select
        value={currentId || ''}
        disabled={!!disabled}
        onChange={(e) => onChange && onChange(e.target.value || null)}
        className="w-full mt-1 px-2 py-1 rounded-sm text-xs italic focus:outline-hidden"
        style={{
          background: 'rgba(20,12,4,0.85)',
          color: has ? '#fde68a' : '#a8a29e',
          border: '1px solid rgba(var(--surface-amber-strong, 120, 53, 15),0.5)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <option value="">{emptyLabel}</option>
        {items.map((it) => (
          <option key={it.id} value={it.id}>
            {it.icon ? `${it.icon} ` : ''}{it.label}
          </option>
        ))}
      </select>
      {summary && (
        <div className="text-[10px] italic text-amber-100/70 mt-1 truncate">{summary}</div>
      )}
    </div>
  );
}

// Display info for the in-dungeon potion HUD (icons mirror App.jsx ITEMS).
const POTION_INFO = {
  minor_heal_tonic:   { icon: '🧪', name: 'Healing Tonic' },
  greater_heal_tonic: { icon: '⚗️', name: 'Greater Draught' },
  shield_draught:     { icon: '🛡️', name: 'Shield Draught' },
  phoenix_ember:      { icon: '🔥', name: 'Phoenix Ember' },
  scholars_brew:      { icon: '☕', name: "Scholar's Brew" },
  foresight_scroll:   { icon: '📜', name: 'Foresight Scroll' },
  tinkers_oil:        { icon: '🪔', name: "Tinker's Oil" },
};


const VIEW_W = 25;
const VIEW_H = 17;
const CANVAS_W = VIEW_W * TILE_PX;
const CANVAS_H = VIEW_H * TILE_PX;
const MOVE_MS = 110;
const WALK_FRAME_MS = 100;
// Held-key movement: after the initial keydown move, repeat at this cadence.
const HOLD_REPEAT_MS = 130;
const MOB_MOVE_MIN_MS = 1400;
const MOB_MOVE_MAX_MS = 2800;

const isWalkable = (t) => t === TILE.FLOOR || t === TILE.DOOR || t === TILE.STAIRS_UP || t === TILE.STAIRS_DOWN;

const DIR_DELTAS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// === Biomes ============================================================
const ELITE_QUESTION_COUNT = 3;
// Damage a wrong answer costs depending on what hit you back.
const DMG_BY_TIER = { basic: 1, elite: 2, boss: 3 };

// === Chest tiers (Phase 15) =============================================
const CHEST_TIERS = {
  wooden: {
    label: 'Wooden Chest',
    icon: '🪵',
    goldRange: [1, 5], // was [10, 30] then [4, 14] — tuned down per playtest, wooden chests felt too generous
    itemChance: 0.65,
    itemPool: ['minor_heal_tonic', 'foresight_scroll', 'tinkers_oil', 'glow_root', 'ember_ash', 'moonleaf'],
  },
  silver: {
    label: 'Silver Chest',
    icon: '🪙',
    goldRange: [10, 25], // tightened to keep the curve smooth after wooden cut
    itemChance: 0.85,
    itemPool: ['greater_heal_tonic', 'shield_draught', 'scholars_brew', 'minor_heal_tonic', 'sigil_dust', 'iron_filings', 'crystal_shard'],
  },
  gold: {
    label: 'Gold Chest',
    icon: '👑',
    goldRange: [50, 100], // tightened proportionally
    itemChance: 1.0,
    itemPool: ['phoenix_ember', 'iron_circlet', 'starbound_cloak', 'oaken_blade', 'gilded_sabre', 'crystal_shard', 'sigil_dust'],
  },
};
// How many of each chest tier spawn per run, by difficulty.
const LOOTABLE_DECOS = {
  mushroom:    { goldRange: [1, 5], itemChance: 0.55, itemPool: ['glow_root', 'glow_root', 'moonleaf', 'minor_heal_tonic'] },
  wildflower:  { goldRange: [1, 3], itemChance: 0.55, itemPool: ['ember_ash', 'moonleaf', 'sigil_dust'] },
  moss_patch:  { goldRange: [1, 2], itemChance: 0.65, itemPool: ['moonleaf', 'moonleaf', 'glow_root'] },
  fern:        { goldRange: [1, 4], itemChance: 0.55, itemPool: ['glow_root', 'glow_root', 'foresight_scroll'] },
  cactus:      { goldRange: [1, 4], itemChance: 0.55, itemPool: ['cactus_pulp', 'cactus_pulp', 'ember_ash'] },
  nightshade:  { goldRange: [2, 5], itemChance: 0.55, itemPool: ['sigil_dust', 'sigil_dust', 'scholars_brew'] },
  rot_flower:  { goldRange: [2, 4], itemChance: 0.55, itemPool: ['iron_filings', 'iron_filings', 'shield_draught'] },
  algae:       { goldRange: [1, 3], itemChance: 0.55, itemPool: ['glow_root', 'crystal_shard', 'minor_heal_tonic'] },
};
// 25b: each biome rolls a boss from a small pool per delve so the same
// difficulty/biome combo doesn't always pit you against the same trial.
// Every boss appears in ≥2 pools so its sprite stays familiar across
// the game.
const norm = (s) => String(s ?? '').trim().toLowerCase();

// Pull random questions from the active tome's quiz pool, excluding any
// already-used questions in this run. Includes flashcards as fallback.
function pickQuestions(courseSet, count, excludeIds = new Set()) {
  const quizPool = (courseSet?.quiz || []).filter((q) =>
    !excludeIds.has(q.id) && (q.type === 'multiplechoice' || q.type === 'truefalse'),
  );
  // Shuffle and take.
  const arr = quizPool.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

// Pick a single question, preferring un-used ones but falling back to the
// full pool if the run has burned through every question. Used by the
// open-ended gauntlet — each wrong answer pulls a fresh prompt instead
// of advancing toward a fixed end-of-trial.
function pickOneQuestion(courseSet, excludeIds = new Set()) {
  const filtered = pickQuestions(courseSet, 1, excludeIds);
  if (filtered.length > 0) return filtered[0];
  const anyOf = pickQuestions(courseSet, 1, new Set());
  return anyOf[0] || null;
}

// 25e: build a single per-question entry for the run's questionLog.
// Pure, exported for unit tests. Captures the source (`mob` / `boss`),
// `mobTier` for mobs, and `bossKind` for bosses so the Chronicle can
// distinguish where each answer came from. Earlier saves omitted these
// fields, so the chronicle was rendering every entry as identical
// (mob entries were present but visually indistinguishable from boss
// entries → the user perceived them as missing).
// PHASE-19 19C: non-color reveal decoration (WCAG 1.4.1). The correct option
// gets a check glyph + solid border, the picked-wrong option a cross glyph +
// dashed border, so the outcome reads without color perception.
function checkAnswerCorrect(question, choice) {
  if (!question) return false;
  if (question.type === 'multiplechoice') {
    return choice === question.correctIndex;
  }
  if (question.type === 'truefalse') {
    if (typeof question.correctIndex === 'number') return choice === question.correctIndex;
    if (typeof question.correctAnswer === 'string') {
      return norm(question.correctAnswer) === norm(choice === 0 ? 'true' : 'false');
    }
  }
  return false;
}

// === BattleModal ========================================================
function BattleModal({
  battle,
  biome,
  onAnswer,
  onFlee,
  canFlee,
  shieldsRemaining,
  hp,
  maxHp,
  bossDisplay,
  firstWrongFreeAvailable,
}) {
  if (!battle) return null;
  const q = battle.currentQuestion;
  if (!q) return null;
  const isBoss = battle.type === 'boss';
  const correctCount = battle.correctCount || 0;
  const mobMaxHp = battle.maxHp || 1;
  const mobHpRemaining = Math.max(0, mobMaxHp - correctCount);
  const tier = isBoss ? 'boss' : (battle.mobTier || 'basic');
  const tierLabel = isBoss ? 'Boss'
                  : tier === 'elite' ? 'Elite'
                  : 'Basic';
  const tierDmg = isBoss ? 3 : tier === 'elite' ? 2 : 1;
  // 25d: damage actually applied on the next wrong answer. Cloak / pet
  // absorbs the first wrong of the run, so the modal should preview 0
  // damage instead of tierDmg until the prop says otherwise.
  const dmgIfWrong = firstWrongFreeAvailable ? 0 : tierDmg;

  const [revealResult, setRevealResult] = useState(null);

  const handle = (choice) => {
    if (revealResult) return;
    const correct = checkAnswerCorrect(q, choice);
    setRevealResult({ correct, choice });
    if (correct) {
      // Right answers still auto-advance after a short reveal flash —
      // no need to dwell, the player's already on the right track.
      setTimeout(() => {
        setRevealResult(null);
        onAnswer(true, q);
      }, 900);
    }
    // Wrong answers: hold the modal open so the player can read the
    // explanation. Advancing happens via the "Next Question" button
    // below (added in the JSX). 25a-6.
  };

  const advanceAfterWrong = () => {
    if (!revealResult || revealResult.correct) return;
    setRevealResult(null);
    onAnswer(false, q);
  };

  // Reset reveal animation when the question or battle changes (q.id is the
  // signal — a wrong answer now swaps in a fresh question, no fixed idx).
  useEffect(() => { setRevealResult(null); }, [q?.id, battle.type]);

  const options = q.type === 'truefalse' ? ['True', 'False'] : (q.options || []);

  // HP-bar block helpers — small color-blocked rectangles per HP point.
  const renderHpRow = (current, max, color, dimColor) => (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: 10, height: 16,
          background: i < current ? color : dimColor,
          border: '1px solid rgba(0,0,0,0.55)',
          borderRadius: 2,
          boxShadow: i < current ? `inset 0 0 4px ${color}` : 'none',
        }} />
      ))}
    </div>
  );

  // 25d: predict bar state for the duration of the reveal flash so the
  // HP bars visibly tick the moment the player picks an option, not when
  // they finally click Next Question. Without this preview, a wrong
  // answer reads as "no damage" until the explanation is dismissed —
  // the bug the user reported as "HP stays full while damage accrues
  // in background." Right-answer mob/boss bars get the same treatment
  // since the parent doesn't commit `correctCount` until the 900 ms
  // reveal timer fires.
  const displayHp = (revealResult && !revealResult.correct)
    ? Math.max(0, hp - dmgIfWrong)
    : hp;
  const displayMobHp = (revealResult && revealResult.correct)
    ? Math.max(0, mobHpRemaining - 1)
    : mobHpRemaining;

  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.78)' }}>
      <div
        className="rounded-lg p-5 max-w-xl w-[90%] shadow-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(31,17,8,0.97) 0%, rgba(20,10,4,0.97) 100%)',
          border: `2px double ${biome.accentSolid}`,
          boxShadow: `0 0 40px ${biome.accent}`,
          fontFamily: '"Cinzel", Georgia, serif',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wider italic" style={{ color: biome.accentSolid }}>
            {isBoss
              ? '⚔ Boss Trial'
              : (mobMaxHp > 1 ? '⚔ Elite Encounter' : '⚔ Encounter')}
          </div>
          <div className="text-[10px] italic text-amber-700">
            Wrong = -{dmgIfWrong} HP
            {firstWrongFreeAvailable && <span className="text-emerald-400/80"> (cloak ready)</span>}
          </div>
        </div>

        {/* HP bars — player vs mob/boss. Both reflect the predicted
            post-answer state during the reveal flash; once the parent
            commits the real change, displayHp/displayMobHp coalesce
            with the prop values seamlessly. */}
        <div className="flex items-center justify-between gap-3 mb-3 px-2 py-2 rounded-sm"
             style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(var(--surface-amber-strong, 120, 53, 15),0.4)' }}>
          <div>
            <div className="text-[10px] italic text-amber-700">Thee · {displayHp}/{maxHp}</div>
            {renderHpRow(displayHp, Math.max(maxHp, hp), '#dc2626', '#3a1414')}
          </div>
          <div className="text-amber-700 italic text-base">⚔</div>
          <div className="text-right">
            <div className="text-[10px] italic text-amber-700">
              {tierLabel}{isBoss && bossDisplay ? ` · ${bossDisplay.name}` : ''} · {displayMobHp}/{mobMaxHp}
            </div>
            {renderHpRow(displayMobHp, mobMaxHp,
              isBoss ? '#a855f7' : tier === 'elite' ? '#f97316' : '#dc2626',
              '#1e293b')}
          </div>
        </div>
        {battle.previewDomain && (
          <div className="text-xs italic text-sky-300 mb-1">🔮 Foresight: {battle.previewDomain}</div>
        )}
        <div className="text-amber-100 italic mb-4 leading-relaxed">{q.question}</div>
        <div className={`grid gap-2 ${q.type === 'truefalse' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {options.map((opt, i) => {
            const isPickedWrong = revealResult && revealResult.choice === i && !revealResult.correct;
            const isPickedRight = revealResult && revealResult.choice === i && revealResult.correct;
            const isAnsRight = revealResult && i === q.correctIndex;
            let bg = 'rgba(31,24,12,0.55)';
            let border = 'rgba(var(--surface-amber-strong, 120, 53, 15),0.5)';
            let color = '#fde68a';
            if (isPickedRight || (revealResult && isAnsRight)) {
              bg = 'rgba(16,185,129,0.25)'; border = '#10b981'; color = '#a7f3d0';
            } else if (isPickedWrong) {
              bg = 'rgba(220,38,38,0.25)'; border = '#dc2626'; color = '#fecaca';
            }
            // 19C: glyph + border-style carry the verdict without color.
            const { glyph, borderStyle } = revealDecoration(revealResult, i, q.correctIndex);
            const borderCss = revealResult ? `2px ${borderStyle} ${border}` : `1px solid ${border}`;
            return (
              <button
                key={i}
                onClick={() => handle(i)}
                disabled={!!revealResult}
                className="text-left px-3 py-2 rounded-sm italic"
                style={{ background: bg, border: borderCss, color, cursor: revealResult ? 'default' : 'pointer' }}
              >
                {glyph}{opt}
              </button>
            );
          })}
        </div>
        {revealResult && (
          <div role="status" className="mt-3 text-xs italic text-amber-300">
            {revealResult.correct
              ? '✦ Thy answer rings true.'
              : '✦ Nay — read the lore, then press onward.'}
            {q.explanation && (
              <div className="mt-1 text-amber-200/80">{q.explanation}</div>
            )}
          </div>
        )}
        {/* 25a-6: on wrong answers, the modal pauses on reveal so the
            player can read the explanation. They advance manually. */}
        {revealResult && !revealResult.correct && (
          <button
            onClick={advanceAfterWrong}
            className="mt-3 px-3 py-2 rounded-sm italic w-full text-sm font-bold"
            style={{
              background: 'linear-gradient(to bottom, #b45309 0%, #78350f 100%)',
              border: '2px solid #fbbf24',
              color: '#fde68a',
              cursor: 'pointer',
            }}
          >
            Next Question →
          </button>
        )}
        {!isBoss && canFlee && (
          <button
            onClick={() => { if (!revealResult) onFlee(); }}
            disabled={!!revealResult}
            className="mt-3 px-3 py-2 rounded-sm italic w-full text-sm"
            style={{
              background: 'rgba(31,24,12,0.55)',
              border: '1px solid rgba(59,130,246,0.6)',
              color: '#93c5fd',
              cursor: revealResult ? 'default' : 'pointer',
            }}
          >
            🛡️ Flee — costs {tier === 'elite' ? '2 shields' : '1 shield'} ({shieldsRemaining} remaining)
          </button>
        )}
        {!isBoss && !canFlee && (
          <div className="mt-3 text-xs italic text-amber-700/80 text-center">
            ⚜ {tier === 'elite' ? 'Need 2 shields to flee an elite.' : 'No shields remain to flee with.'} ⚜
          </div>
        )}
        {isBoss && (
          <div className="mt-3 text-xs italic text-amber-700/80 text-center">
            ⚜ No flight from a dungeon lord. ⚜
          </div>
        )}
      </div>
    </div>
  );
}

// === EndRunOverlay ======================================================
function EndRunOverlay({ runState, biome, summary, onExit, onNewDelve }) {
  if (runState !== 'victory' && runState !== 'death') return null;
  const won = runState === 'victory';
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div
        className="rounded-lg p-6 max-w-md w-[90%] text-center"
        style={{
          background: won
            ? 'linear-gradient(180deg, rgba(20,40,28,0.97) 0%, rgba(8,20,14,0.97) 100%)'
            : 'linear-gradient(180deg, rgba(40,12,12,0.97) 0%, rgba(20,4,4,0.97) 100%)',
          border: `2px double ${won ? '#10b981' : '#dc2626'}`,
          fontFamily: '"Cinzel", Georgia, serif',
        }}
      >
        <div className="text-3xl mb-2">{won ? '👑' : '💀'}</div>
        <div className="text-xl italic mb-1" style={{ color: won ? '#a7f3d0' : '#fecaca' }}>
          {won ? 'Victory!' : 'Slain.'}
        </div>
        <div className="text-xs italic mb-4" style={{ color: biome.accentSolid }}>
          {won
            ? `Thou hast felled ${BOSS_DISPLAY[summary.bossId]?.name || 'the dungeon lord'}.`
            : 'Thy quest ends here. Return when thou art ready.'}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs italic mb-4">
          <div className="p-2 rounded-sm" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="text-amber-700">Foes felled</div>
            <div className="text-amber-200">{summary.score}</div>
          </div>
          <div className="p-2 rounded-sm" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="text-amber-700">HP remaining</div>
            <div className="text-amber-200">{summary.hp} / {summary.maxHp}</div>
          </div>
          <div className="p-2 rounded-sm" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="text-amber-700">Mistakes</div>
            <div className="text-amber-200">{summary.mistakes}</div>
          </div>
          <div className="p-2 rounded-sm" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="text-amber-700">Best streak</div>
            <div className="text-amber-200">{summary.maxStreak}</div>
          </div>
        </div>
        {won && (
          <div className="text-xs italic text-amber-300 mb-4">
            +{summary.xpAwarded} XP · +{summary.goldAwarded} gold
          </div>
        )}
        {!won && summary.deathPenaltyApplied && (
          <div className="text-xs italic mb-4">
            <div className="text-amber-300">+{summary.xpAwarded} XP awarded</div>
            <div className="text-rose-300/80 text-[11px] mt-1">
              ⚜ Death penalty: half thy in-run XP forfeit ({summary.xpEarnedInRun} → {summary.xpAwarded}) ⚜
            </div>
          </div>
        )}
        <div className="flex gap-2 justify-center flex-wrap">
          {onNewDelve && (
            <button
              onClick={onNewDelve}
              className="px-4 py-2 rounded-sm italic font-bold"
              style={{
                background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                color: '#451a03',
                border: '2px solid #fbbf24',
              }}
            >
              ⚔ New Delve
            </button>
          )}
          <button
            onClick={onExit}
            className="px-4 py-2 rounded-sm italic"
            style={{
              background: 'rgba(var(--surface-amber-strong, 120, 53, 15),0.7)',
              border: '1px solid rgba(245,158,11,0.8)',
              color: '#fde047',
            }}
          >
            Return to Hearth
          </button>
        </div>
      </div>
    </div>
  );
}

const FACING_LABELS = { up: 'up', down: 'down', left: 'left', right: 'right' };

const DIFFICULTY_LABELS = {
  apprentice: { label: 'Apprentice', icon: '🛡️' },
  adept:      { label: 'Adept',      icon: '⚔️' },
  master:     { label: 'Master',     icon: '👑' },
  mythic:     { label: 'Mythic',     icon: '🌟' },
};

// === Component ==========================================================
export default function DungeonExplore({
  onExit,
  playerState,
  subject,
  courseSet,
  tomeProgress,
  awardXP,
  awardGold,
  recordAnswer,
  checkAchievement,
  unlockSpecialTitle,
  updateProgress,
  updateTomeProgress,
  trackDungeonAttempt,
  onViewHistory,
  consumeItem,
  giveItem,
  recordBestiary,
  // 25j: optional quest-counter bumpers — recordSpellCast fires inside
  // pay() on every successful cast; recordHarvest fires inside
  // harvestHere whenever a lootable deco yields. Optional so older
  // harnesses/tests can mount DungeonExplore without them.
  recordSpellCast,
  recordHarvest,
  awardPetXp,
  petCatalog,
  spellCatalog,
  // 25c: optional equip plumbing for the setup-screen dropdowns. The
  // panel falls back to a read-only summary if any of these are absent
  // so DungeonExplore stays callable from older harnesses / tests.
  itemCatalog,
  equipItem,
  unequipSlot,
  equipPet,
  unequipPet,
  equipPotion,
  unequipPotion,
  equipSpell,
  unequipSpell,
}) {
  const isUnlocked = (id) => {
    if (id === 'apprentice') return true;
    if (!playerState) return false;
    const totalRuns = (playerState.library || []).reduce((s, t) => s + (t.progress?.runsCompleted || 0), 0);
    const ach = playerState.achievements || [];
    const lvl = playerState.level || 1;
    if (id === 'adept')  return lvl >= 10 || totalRuns >= 5;
    if (id === 'master') return lvl >= 25 || (ach.includes('flawless') && ach.includes('first_boss'));
    if (id === 'mythic') return lvl >= 50 || ach.includes('master_complete');
    return false;
  };
  const defaultDifficulty = useMemo(() => {
    const order = ['mythic', 'master', 'adept', 'apprentice'];
    return order.find(isUnlocked) || 'apprentice';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [difficulty, setDifficulty] = useState(defaultDifficulty);
  const diffConfig = DIFF_CONFIG[difficulty] || DIFF_CONFIG.apprentice;

  // Equipment — read from playerState. Compute combined dungeon bonuses
  // once per loadout change and apply at run start. Phase 18 also folds
  // the equipped pet's level-scaled passive into the same accumulator.
  const equipped = playerState?.equipped || {};
  const ownedPets = playerState?.pets || {};
  const activePet = useMemo(() => {
    const id = equipped.pet;
    if (!id) return null;
    const def = petCatalog?.find?.(p => p.id === id) || null;
    if (!def) return null;
    const xp = (ownedPets[id]?.xp) || 0;
    const level = petLevelFromXp(xp);
    return { def, level, xp };
  }, [equipped.pet, ownedPets, petCatalog]);
  const equipBonuses = useMemo(() => {
    const slots = [equipped.weapon, equipped.head, equipped.cloak].filter(Boolean);
    const acc = { maxHpBonus: 0, shieldBonus: 0, xpMul: 1, goldMul: 1, mobScoreBonus: 0, firstWrongFree: false, plantDoublePct: 0 };
    slots.forEach((id) => {
      const eff = EQUIP_EFFECTS[id];
      if (!eff) return;
      if (eff.maxHpBonus)    acc.maxHpBonus += eff.maxHpBonus;
      if (eff.shieldBonus)   acc.shieldBonus += eff.shieldBonus;
      if (eff.xpMul)         acc.xpMul *= eff.xpMul;
      if (eff.goldMul)       acc.goldMul *= eff.goldMul;
      if (eff.mobScoreBonus) acc.mobScoreBonus += eff.mobScoreBonus;
      if (eff.firstWrongFree) acc.firstWrongFree = true;
    });
    if (activePet) {
      const { def, level } = activePet;
      const value = (def.base || 0) + (def.perLevel || 0) * (level - 1);
      switch (def.passive) {
        case 'xp_pct':            acc.xpMul *= 1 + value / 100; break;
        case 'gold_pct':          acc.goldMul *= 1 + value / 100; break;
        case 'shield_bonus':      acc.shieldBonus += value; break;
        case 'first_wrong_free':  acc.firstWrongFree = true; break;
        case 'plant_double_pct':  acc.plantDoublePct += value; break;
        default: break;
      }
      if (def.secondary === 'mob_score') {
        acc.mobScoreBonus += (def.secondaryBase || 0) + (def.secondaryPerLevel || 0) * (level - 1);
      }
    }
    return acc;
  }, [equipped.weapon, equipped.head, equipped.cloak, activePet]);

  const permUp = playerState?.permUpgrades || {};
  const effectiveMaxHp     = diffConfig.hp + equipBonuses.maxHpBonus + (permUp.maxHp || 0);
  const effectiveMaxShield = Math.max(0, diffConfig.shields + equipBonuses.shieldBonus);

  const biomeId = useMemo(() => pickBiomeForSubject(subject), [subject]);
  const biome = BIOMES[biomeId] || BIOMES.halls;

  // 25b: per-delve seed bumped by beginRun so two consecutive delves at
  // the same difficulty/biome regenerate the map (and re-roll the boss).
  // Initialized to a random uint32 so the first delve of a session isn't
  // deterministic across reloads.
  const [delveSeed, setDelveSeed] = useState(() => Math.floor(Math.random() * 0xffffffff));
  const pendingStartRef = useRef(false);

  const initial = useMemo(
    () => generateMap({ difficulty, biome: biomeId, rng: makeSeededRng(delveSeed) }),
    [difficulty, biomeId, delveSeed],
  );

  // Run state
  const [phase, setPhase] = useState('setup'); // setup | world
  const [pos, setPos] = useState(initial.spawn);
  const [facing, setFacing] = useState('down');
  const [hp, setHp] = useState(effectiveMaxHp);
  const [shields, setShields] = useState(effectiveMaxShield);
  const [firstWrongUsed, setFirstWrongUsed] = useState(false);
  // 25a-5: boss room is locked at delve start. The key is hidden in one
  // random chest in the dungeon (tagged hasKey at map-gen) OR can drop
  // from a felled mob (5% basic, 25% elite). Once held, the boss
  // collision starts the trial; without it the player gets a notice.
  const [bossKeyFound, setBossKeyFound] = useState(false);
  // Phase 19: mana for active spells. Resets each delve to maxMana, refills
  // +1 per correct answer. Cap = playerState.maxMana.
  const maxMana = playerState?.maxMana ?? 3;
  const [mana, setMana] = useState(maxMana);
  // 17G: banked Foresight Scroll charges — each reveals the domain of the next
  // posed riddle. A ref (not state) so consuming a charge at battle creation
  // doesn't need a re-render cycle.
  const foresightChargesRef = useRef(0);
  // Brief hint shown above the battle question when a Sigil of Clarity is
  // cast — clears on the next question cycle.
  const [revealedAnswer, setRevealedAnswer] = useState(null);
  const [reviveAvailable, setReviveAvailable] = useState(false);
  const [xpBuffRemaining, setXpBuffRemaining] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [runState, setRunState] = useState('alive'); // alive | victory | death
  const [battle, setBattle] = useState(null);
  // S3: off-canvas screen-reader announcements for the (otherwise opaque) delve.
  const [liveMsg, setLiveMsg] = useState('');
  useEffect(() => {
    if (phase !== 'world') return;
    if (runState === 'victory') { setLiveMsg('Victory! The delve is won.'); return; }
    if (runState === 'death') { setLiveMsg('Defeat. The delve has ended.'); return; }
    if (battle) { setLiveMsg('A foe blocks the path — a battle begins. Answer the riddle to fight.'); return; }
    setLiveMsg('');
  }, [phase, battle, runState]);
  const [endSummary, setEndSummary] = useState(null);
  // Brief notification banner for potion/revive/buff feedback.
  const [notice, setNotice] = useState(null);
  // Phase 15: floating "+gold" / "Acquired: X" labels — short-lived UI.
  const [floatingPickups, setFloatingPickups] = useState([]);
  const showPickup = (text, color = '#fde047') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setFloatingPickups((prev) => [...prev, { id, text, color }]);
    setTimeout(() => {
      setFloatingPickups((prev) => prev.filter((p) => p.id !== id));
    }, 1500);
  };

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const mobsRef = useRef(initial.mobs.map((m) => ({ ...m })));
  // Phase 15: mutable mirrors of decorations + chests so they can be
  // harvested / opened mid-run without re-running map-gen.
  const decorationsRef = useRef(initial.decorations.map((d) => ({ ...d })));
  const chestsRef = useRef((initial.chests || []).map((c) => ({ ...c })));
  const usedQuestionIdsRef = useRef(new Set());
  const runQuestionLogRef = useRef([]);
  const runStartTimeRef = useRef(Date.now());
  const trackedAttemptRef = useRef(false);
  // Phase 14: in-run XP accumulates here so death can halve it without
  // retroactively pulling XP back from playerState.
  const xpEarnedRef = useRef(0);

  const stateRef = useRef({});
  useLayoutEffect(() => {
    stateRef.current = {
      phase, pos, facing, biome, initial, hp, maxHp: effectiveMaxHp,
      shields, maxShields: effectiveMaxShield, battle, runState, score, equipped,
      reviveAvailable, xpBuffRemaining, activePet, bossKeyFound,
    };
  });

  // Reset on map regen / difficulty change / loadout change. Drops back to
  // setup unless beginRun set pendingStartRef — then the same regen also
  // launches the world phase, which is how delveSeed bumps spawn a fresh
  // map per Begin Delve.
  useEffect(() => {
    setPos(initial.spawn);
    setFacing('down');
    setHp(effectiveMaxHp);
    setShields(effectiveMaxShield);
    setMana(maxMana);
    foresightChargesRef.current = 0; // 17G: clear banked Foresight charges per delve
    setRevealedAnswer(null);
    setFirstWrongUsed(false);
    setBossKeyFound(false);
    setReviveAvailable(false);
    setXpBuffRemaining(0);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setMistakes(0);
    setRunState('alive');
    setBattle(null);
    setEndSummary(null);
    mobsRef.current = initial.mobs.map((m) => ({ ...m }));
    decorationsRef.current = initial.decorations.map((d) => ({ ...d }));
    chestsRef.current = (initial.chests || []).map((c) => ({ ...c }));
    usedQuestionIdsRef.current = new Set();
    runQuestionLogRef.current = [];
    runStartTimeRef.current = Date.now();
    xpEarnedRef.current = 0;
    if (pendingStartRef.current) {
      pendingStartRef.current = false;
      setNotice(null);
      if (!trackedAttemptRef.current && trackDungeonAttempt) {
        trackedAttemptRef.current = true;
        try { trackDungeonAttempt(); } catch { /* best-effort */ }
      }
      setPhase('world');
    } else {
      trackedAttemptRef.current = false;
      setPhase('setup');
    }
  }, [initial, effectiveMaxHp, effectiveMaxShield]);

  // Begin a delve from the setup screen. Bumps delveSeed → useMemo
  // regenerates `initial` → the reset useEffect above runs, sees the
  // pending flag, and flips to world. All the per-run resets live in
  // that effect to keep beginRun a single intent ("start a fresh run").
  const beginRun = () => {
    pendingStartRef.current = true;
    setDelveSeed((s) => (s + 1) >>> 0);
  };

  // After a victory or defeat, return to the setup screen for another delve.
  const newDelve = () => setPhase('setup');

  // Phase 21: biome BGM. Start when entering the world phase, stop on unmount
  // or when returning to setup. The audio module is muted by default so this
  // is silent until the player toggles audio on in settings.
  useEffect(() => {
    if (phase !== 'world') return undefined;
    startBgm(biomeId);
    return () => { stopBgm(); };
  }, [phase, biomeId]);

  // === Spell casting (Phase 19) ========================================
  // Triggered by hotkeys Z/X/C or on-screen spell buttons. Some spells
  // are world-only (heal, shield, smite, riftstep) while others need a
  // battle in progress (auto_correct, reveal_answer). Mana cost is paid
  // up front; if the spell can't act (e.g. healing at full HP) the spell
  // refunds its cost.
  const castSpell = (slotIdx) => {
    if (phase !== 'world' || runState !== 'alive') return;
    const spellId = ((playerState?.equippedSpells) || [null, null, null])[slotIdx];
    const hk = ['Z', 'X', 'C'][slotIdx] || '?';
    // Visible feedback when the player presses a hotkey for an empty
    // slot. Without this the keypress was silent and felt broken.
    if (!spellId) {
      setNotice({ tone: 'info', text: `Spell slot ${hk} is empty. Slot one in the Spellbook.` });
      return;
    }
    const def = spellCatalog?.find?.(s => s.id === spellId)
      || (SPELL_INFO[spellId] ? { id: spellId, ...SPELL_INFO[spellId] } : null);
    if (!def) return;
    if (mana < (def.cost || 0)) {
      setNotice({ tone: 'info', text: `${def.name}: not enough mana.` });
      return;
    }
    const refund = () => { /* no mana spent */ };
    const pay = () => {
      setMana((m) => Math.max(0, m - (def.cost || 0)));
      playSfx('cast');
      if (recordSpellCast) recordSpellCast();
    };

    switch (def.effect) {
      case 'heal': {
        if (battle) { setNotice({ tone: 'info', text: 'Cannot mend mid-trial.' }); return; }
        if (hp >= effectiveMaxHp) {
          setNotice({ tone: 'info', text: `${def.name}: already at full lives.` });
          return refund();
        }
        setHp((h) => Math.min(effectiveMaxHp, h + (def.amount || 1)));
        pay();
        setNotice({ tone: 'good', text: `${def.name}: lives restored.` });
        return;
      }
      case 'shield': {
        if (battle) { setNotice({ tone: 'info', text: 'Cannot ward mid-trial.' }); return; }
        if (effectiveMaxShield === 0) {
          setNotice({ tone: 'info', text: 'No shield bond is permitted on this difficulty.' });
          return refund();
        }
        if (shields >= effectiveMaxShield) {
          setNotice({ tone: 'info', text: `${def.name}: shields already full.` });
          return refund();
        }
        setShields((s) => Math.min(effectiveMaxShield, s + (def.amount || 1)));
        pay();
        setNotice({ tone: 'good', text: `${def.name}: a ward kindles.` });
        return;
      }
      case 'smite_nearest_mob': {
        if (battle) { setNotice({ tone: 'info', text: 'Cannot smite — already in trial.' }); return; }
        const mobs = mobsRef.current;
        if (mobs.length === 0) {
          setNotice({ tone: 'info', text: 'No foe walks within reach.' });
          return refund();
        }
        let bestIdx = -1, bestDist = Infinity;
        for (let i = 0; i < mobs.length; i++) {
          const d = Math.abs(mobs[i].x - pos.x) + Math.abs(mobs[i].y - pos.y);
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        if (bestIdx < 0) return refund();
        const slain = mobs[bestIdx];
        mobs.splice(bestIdx, 1);
        if (slain && recordBestiary) recordBestiary(slain.kind);
        if (awardXP) awardXP(5, 'Smited by lance');
        pay();
        setNotice({ tone: 'good', text: `${def.name} struck down a foe!` });
        return;
      }
      case 'teleport_spawn': {
        if (battle) { setNotice({ tone: 'info', text: 'Cannot riftstep mid-trial.' }); return; }
        setPos({ ...initial.spawn });
        pay();
        setNotice({ tone: 'good', text: `${def.name}: thou art back at the threshold.` });
        return;
      }
      case 'auto_correct': {
        if (!battle) { setNotice({ tone: 'info', text: `${def.name} requires a foe to face.` }); return; }
        const q = battle.currentQuestion; // F10 (17G): battle has no questions[]/questionIdx — that threw mid-battle
        if (!q) return refund();
        pay();
        setNotice({ tone: 'good', text: `${def.name}: truth lances the question.` });
        // Defer to next tick so the notice paints before the answer fires.
        setTimeout(() => onBattleAnswer(true, q), 60);
        return;
      }
      case 'reveal_answer': {
        if (!battle) { setNotice({ tone: 'info', text: `${def.name} requires a foe to face.` }); return; }
        const q = battle.currentQuestion; // F10 (17G): battle has no questions[]/questionIdx — that threw mid-battle
        if (!q) return refund();
        let answerLabel = '';
        if (q.type === 'multiplechoice' && typeof q.correctIndex === 'number') {
          answerLabel = `Option ${q.correctIndex + 1}: ${q.options?.[q.correctIndex] || ''}`.slice(0, 80);
        } else if (q.type === 'truefalse') {
          if (typeof q.correctIndex === 'number') answerLabel = q.correctIndex === 0 ? 'True' : 'False';
          else if (q.correctAnswer) answerLabel = String(q.correctAnswer);
        }
        if (!answerLabel) {
          setNotice({ tone: 'info', text: `${def.name}: the truth resists thee.` });
          return refund();
        }
        pay();
        setRevealedAnswer(answerLabel);
        setNotice({ tone: 'good', text: `${def.name}: ${answerLabel}` });
        setTimeout(() => setRevealedAnswer(null), 4500);
        return;
      }
      default: {
        setNotice({ tone: 'info', text: `${def.name}: nothing happens.` });
        return;
      }
    }
  };

  // === Potion use =======================================================
  // Triggered by hotkeys 1/2/3 or the on-screen quick-slot buttons. Only
  // active during the world phase while alive and not in a battle.
  const usePotion = (slotIdx) => {
    if (phase !== 'world' || runState !== 'alive' || battle) return;
    const itemId = ((playerState?.equipped?.potions) || [null, null, null])[slotIdx];
    const hk = String(slotIdx + 1);
    // Visible feedback when the player presses a hotkey for an empty
    // slot or a potion that's been used up. Without this the keypress
    // was silent and felt broken.
    if (!itemId) {
      setNotice({ tone: 'info', text: `Potion slot ${hk} is empty. Slot one in The Hoard.` });
      return;
    }
    const count = (playerState?.inventory || {})[itemId] || 0;
    if (count <= 0) {
      const usedLabel = POTION_INFO[itemId]?.name || 'this potion';
      setNotice({ tone: 'info', text: `Slot ${hk}: thou hast no ${usedLabel} left.` });
      return;
    }
    const eff = POTION_EFFECTS[itemId];
    if (!eff) return;
    let usedLabel = POTION_INFO[itemId]?.name || 'Potion';
    let acted = false;
    let actedNotice = null; // 17G: per-effect success notice (defaults to "Drained: …")
    switch (eff.kind) {
      case 'heal': {
        if (hp >= effectiveMaxHp) {
          setNotice({ tone: 'info', text: `${usedLabel}: thy lives are already full.` });
          return;
        }
        setHp((h) => Math.min(effectiveMaxHp, h + (eff.amount || 1)));
        acted = true;
        break;
      }
      case 'shield': {
        if (effectiveMaxShield === 0) {
          setNotice({ tone: 'info', text: `No shield bond is permitted on this difficulty.` });
          return;
        }
        if (shields >= effectiveMaxShield) {
          setNotice({ tone: 'info', text: `${usedLabel}: thy shields are already full.` });
          return;
        }
        setShields((s) => Math.min(effectiveMaxShield, s + (eff.amount || 1)));
        acted = true;
        break;
      }
      case 'revive': {
        if (reviveAvailable) {
          setNotice({ tone: 'info', text: 'Phoenix Ember already burns within thee.' });
          return;
        }
        setReviveAvailable(true);
        acted = true;
        break;
      }
      case 'xp_buff': {
        setXpBuffRemaining((n) => Math.max(n, eff.questions || 3));
        acted = true;
        break;
      }
      case 'foresight': {
        // 17G: bank a charge — the next posed riddle previews its domain.
        foresightChargesRef.current += 1;
        actedNotice = { tone: 'good', text: 'Eyes Beyond: the next riddle\'s nature shall be revealed.' };
        acted = true;
        break;
      }
      case 'mana': {
        // 17G: Tinker's Oil restores spell mana (the live analog of the old
        // "spent power-up"). Not consumed when mana is already full.
        if (mana >= maxMana) {
          setNotice({ tone: 'info', text: `${usedLabel}: thy mana is already full.` });
          return;
        }
        setMana((m) => Math.min(maxMana, m + (eff.amount || 1)));
        acted = true;
        break;
      }
      default: {
        // 17G: unknown effect — never destroy the item (was a consuming no-op).
        setNotice({ tone: 'info', text: `${usedLabel}: nothing happens.` });
        return;
      }
    }
    if (acted && consumeItem) consumeItem(itemId);
    if (acted) {
      playSfx('pickup');
      setNotice(actedNotice || { tone: 'good', text: `Drained: ${usedLabel}` });
    }
  };

  // Auto-clear the notice banner after a short delay.
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(t);
  }, [notice]);

  // Movement.
  const tryMove = (dx, dy, dir) => {
    if (phase !== 'world' || battle || runState !== 'alive') return;
    setFacing(dir);

    // 25a-6b: Boss Door no longer auto-unlocks on walk-into. Walking into
    // a sealed door just blocks the move with a contextual notice; the
    // player must press the Interact key (E) or click the on-screen
    // unlock button when adjacent. See unlockBossDoorHere() below.
    const nx0 = pos.x + dx, ny0 = pos.y + dy;
    if (ny0 >= 0 && ny0 < initial.map.length && nx0 >= 0 && nx0 < initial.map[0].length) {
      if (initial.map[ny0][nx0] === TILE.BOSS_DOOR) {
        setNotice({
          tone: 'info',
          text: bossKeyFound
            ? '⚷ Press E (or tap Unlock) to use the Boss Key on this door.'
            : '⚷ The Boss Door is sealed. Find a Boss Key.',
        });
        return;
      }
    }

    setPos((p) => {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (ny < 0 || ny >= initial.map.length) return p;
      if (nx < 0 || nx >= initial.map[0].length) return p;
      if (!isWalkable(initial.map[ny][nx])) return p;
      // Phase 22: footstep tap. Light + short so a held key still sounds OK.
      playSfx('step');
      return { x: nx, y: ny };
    });
  };

  // 25a-6b: explicit unlock action. Fires when the player is adjacent
  // (4-cardinal) to any BOSS_DOOR tile. Without the key it just nags;
  // with it, convert every BOSS_DOOR in the dungeon to FLOOR and
  // consume the key. Bound to the E key + an on-screen button.
  const isBossDoorAdjacent = () => {
    const map = initial.map;
    for (const [dx2, dy2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = pos.x + dx2, ny = pos.y + dy2;
      if (map[ny]?.[nx] === TILE.BOSS_DOOR) return true;
    }
    return false;
  };
  const unlockBossDoorHere = () => {
    if (phase !== 'world' || battle || runState !== 'alive') return;
    if (!isBossDoorAdjacent()) {
      setNotice({ tone: 'info', text: 'No Boss Door within reach.' });
      return;
    }
    if (!bossKeyFound) {
      setNotice({ tone: 'info', text: '⚷ Thou hast no Boss Key. Loot a chest or fell a foe.' });
      return;
    }
    for (let y = 0; y < initial.map.length; y++) {
      for (let x = 0; x < initial.map[0].length; x++) {
        if (initial.map[y][x] === TILE.BOSS_DOOR) initial.map[y][x] = TILE.FLOOR;
      }
    }
    setBossKeyFound(false);
    playSfx('chest');
    setNotice({ tone: 'good', text: '⚷ The lock yields. The chamber opens.' });
  };

  // === Held-key movement ================================================
  // Track which direction keys are held so the player can walk
  // continuously by holding a key. The rAF loop repeats the move at
  // HOLD_REPEAT_MS cadence; the initial press fires immediately.
  const heldKeysRef = useRef(new Set());
  const lastMoveAtRef = useRef(0);
  // 25i-3: timestamp of the most recent bump-into-mob/boss. drawPlayer
  // reads this to draw a 200ms weapon swing arc on collision.
  const bumpAtRef = useRef(0);
  const dirOfKey = (key) => {
    switch (key) {
      case 'ArrowUp': case 'w': case 'W':    return 'up';
      case 'ArrowDown': case 's': case 'S':  return 'down';
      case 'ArrowLeft': case 'a': case 'A':  return 'left';
      case 'ArrowRight': case 'd': case 'D': return 'right';
      default: return null;
    }
  };

  // 25b: harvest action — picks the plant the player is currently standing
  // on. Moved out of tryMove so harvest is an explicit interact, not a
  // pickup-by-walk-over.
  const isOnHarvestablePlant = () =>
    decorationsRef.current.some((d) => d.x === pos.x && d.y === pos.y && LOOTABLE_DECOS[d.kind]);
  const harvestHere = () => {
    if (phase !== 'world' || battle || runState !== 'alive') return;
    const decoIdx = decorationsRef.current.findIndex(
      (d) => d.x === pos.x && d.y === pos.y && LOOTABLE_DECOS[d.kind],
    );
    if (decoIdx < 0) return;
    const deco = decorationsRef.current[decoIdx];
    const cfg = LOOTABLE_DECOS[deco.kind];
    const lo = cfg.goldRange[0];
    const hi = cfg.goldRange[1];
    const goldGain = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (goldGain > 0 && awardGold) awardGold(goldGain, `Harvested ${deco.kind.replace('_', ' ')}`);
    if (goldGain > 0) showPickup(`+${goldGain}`, '#fde047');
    if (Math.random() < (cfg.itemChance || 0) && cfg.itemPool.length > 0 && giveItem) {
      const itemId = cfg.itemPool[Math.floor(Math.random() * cfg.itemPool.length)];
      // Phase 18: Glade Fox can double the harvest.
      const doubled = (equipBonuses.plantDoublePct || 0) > 0
        && Math.random() * 100 < equipBonuses.plantDoublePct;
      const count = doubled ? 2 : 1;
      giveItem(itemId, count);
      const info = POTION_INFO[itemId];
      const label = info ? info.name : itemId;
      showPickup(doubled ? `Acquired: ${label} ×2` : `Acquired: ${label}`, '#a7f3d0');
    }
    decorationsRef.current.splice(decoIdx, 1);
    if (recordHarvest) recordHarvest();
    playSfx('pickup');
  };

  // 25b: single E-key dispatch. Door takes priority since the player
  // can't be standing on a plant tile and adjacent to a door at once,
  // but defensive ordering keeps the "no nag" contract — pressing E
  // with nothing interactable nearby is a silent no-op.
  const interactWithWorld = () => {
    if (phase !== 'world' || battle || runState !== 'alive') return;
    if (isBossDoorAdjacent()) {
      unlockBossDoorHere();
      return;
    }
    if (isOnHarvestablePlant()) {
      harvestHere();
    }
  };

  // Latest usePotion / tryMove / interact via refs so the keydown handler
  // can reach them without restarting on every render.
  const usePotionRef = useRef(usePotion);
  useLayoutEffect(() => { usePotionRef.current = usePotion; });
  const castSpellRef = useRef(castSpell);
  useLayoutEffect(() => { castSpellRef.current = castSpell; });
  const interactRef = useRef(interactWithWorld);
  useLayoutEffect(() => { interactRef.current = interactWithWorld; });

  useEffect(() => {
    if (phase !== 'world') return undefined;
    const onKeyDown = (e) => {
      // Phase 19: Spell hotkeys Z/X/C (rebound from Q/W/E in 25a so W
      // doesn't collide with WASD movement). Spells work even during a
      // battle (auto_correct, reveal_answer); other spells refuse
      // mid-trial via castSpell's checks.
      const sk = e.key.toLowerCase();
      if (sk === 'z' || sk === 'x' || sk === 'c') {
        const idx = sk === 'z' ? 0 : sk === 'x' ? 1 : 2;
        castSpellRef.current && castSpellRef.current(idx);
        e.preventDefault();
        return;
      }
      if (battle) return;
      if (runState !== 'alive') {
        if (e.key === 'Escape' && onExit) onExit();
        return;
      }
      if (e.key === 'Escape') { if (onExit) onExit(); return; }
      // 25b: E interacts with the world — unlocks the Boss Door when
      // adjacent (with key in hand) or harvests a plant when standing
      // on a lootable tile. Silent no-op otherwise.
      if (sk === 'e') {
        interactRef.current && interactRef.current();
        e.preventDefault();
        return;
      }
      // Potion hotkeys 1/2/3.
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        usePotionRef.current && usePotionRef.current(parseInt(e.key, 10) - 1);
        e.preventDefault();
        return;
      }
      const dir = dirOfKey(e.key);
      if (!dir) return;
      e.preventDefault();
      if (!heldKeysRef.current.has(dir)) {
        heldKeysRef.current.add(dir);
        const [dx, dy] = DIR_DELTAS[dir];
        tryMove(dx, dy, dir);
        lastMoveAtRef.current = performance.now();
      }
    };
    const onKeyUp = (e) => {
      const dir = dirOfKey(e.key);
      if (dir) heldKeysRef.current.delete(dir);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    if (containerRef.current) containerRef.current.focus();
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      heldKeysRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, battle, runState, initial.map, onExit]);

  // Mob / boss / chest / plant collision detection on every position change.
  useEffect(() => {
    if (phase !== 'world' || battle || runState !== 'alive') return;
    // Boss collision. Boss has 5 HP — needs 5 correct answers. Each
    // wrong answer pulls a new question instead of advancing toward
    // the end of a fixed gauntlet.
    if (initial.boss && pos.x === initial.boss.x && pos.y === initial.boss.y) {
      // 25a-6: the boss-tile collision is now reached only AFTER the
      // player walks through the unlocked Boss Door (which consumes
      // the key). The 25a-5 in-place gate is no longer needed since
      // the door blocks entry to the chamber entirely.
      const first = pickOneQuestion(courseSet, usedQuestionIdsRef.current);
      if (!first) {
        // No quiz questions in tome — auto-victory rather than soft-locking.
        finishRun(true, { earlyByEmptyTome: true });
        return;
      }
      usedQuestionIdsRef.current.add(first.id);
      bumpAtRef.current = performance.now();
      setBattle({ type: 'boss', currentQuestion: first, correctCount: 0, maxHp: 5, previewDomain: takeForesightPreview(foresightChargesRef, first) }); // 17G
      return;
    }
    // Mob collision — basic = 1 HP (one correct = dead), elite = 3 HP.
    const mobIdx = mobsRef.current.findIndex((m) => m.x === pos.x && m.y === pos.y);
    if (mobIdx >= 0) {
      const mob = mobsRef.current[mobIdx];
      const mobHp = mob.tier === 'elite' ? ELITE_QUESTION_COUNT : 1;
      const first = pickOneQuestion(courseSet, usedQuestionIdsRef.current);
      if (!first) {
        mobsRef.current.splice(mobIdx, 1);
        if (awardXP) awardXP(5, 'Foe felled (silent)');
        return;
      }
      usedQuestionIdsRef.current.add(first.id);
      bumpAtRef.current = performance.now();
      setBattle({ type: 'mob', mobIdx, mobTier: mob.tier, currentQuestion: first, correctCount: 0, maxHp: mobHp, previewDomain: takeForesightPreview(foresightChargesRef, first) }); // 17G
      return;
    }
    // Chest collision — pay out gold + maybe an item, mark as opened.
    const chestIdx = chestsRef.current.findIndex((c) => !c.opened && c.x === pos.x && c.y === pos.y);
    if (chestIdx >= 0) {
      const chest = chestsRef.current[chestIdx];
      const cfg = CHEST_TIERS[chest.tier] || CHEST_TIERS.wooden;
      const lo = cfg.goldRange[0];
      const hi = cfg.goldRange[1];
      const goldGain = lo + Math.floor(Math.random() * (hi - lo + 1));
      if (awardGold) awardGold(goldGain, cfg.label);
      showPickup(`+${goldGain} gold`, '#fde047');
      if (Math.random() < cfg.itemChance && cfg.itemPool.length > 0 && giveItem) {
        const itemId = cfg.itemPool[Math.floor(Math.random() * cfg.itemPool.length)];
        giveItem(itemId, 1);
        const info = POTION_INFO[itemId];
        showPickup(`Acquired: ${info ? info.name : itemId}`, '#a7f3d0');
      }
      // 25a-5: the boss key chest grants the key on first open. If the
      // player already has the key (mob drop), the chest still opens
      // for its gold/item but doesn't double-grant.
      if (chest.hasKey && !bossKeyFound) {
        setBossKeyFound(true);
        showPickup('⚷ Boss Key', '#fde047');
        setNotice({ tone: 'good', text: '⚷ Acquired: Boss Key. The chamber awaits.' });
      }
      chest.opened = true;
      playSfx('chest');
      return;
    }
    // 25b: plants no longer auto-harvest on walk-over. Standing on a
    // lootable plant tile shows a "Press E" prompt; the harvest payout
    // moved to harvestHere() below, dispatched by the world-interact
    // keybinding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  // Battle answer resolution.
  const onBattleAnswer = (correct, q) => {
    // 25e: source-tagged push so the Chronicle can render distinct
    // mob-vs-boss badges. Older entries (pre-25e) omit `source` and
    // gracefully render without a badge — see RunHistoryScreen.
    runQuestionLogRef.current.push(
      buildQuestionLogEntry(q, correct, battle, initial.boss?.kind, runQuestionLogRef.current.length)
    );
    if (recordAnswer) {
      // recordAnswer signature is (correct, item). Pass the full question
      // so the parent's mistakeVault dedup keys off q.id (matching Quiz/Lab
      // mode behavior); the prior single-arg call silently inflated
      // totalCorrect (object always truthy) and skipped vault dedup.
      try { recordAnswer(!!correct, q); }
      catch { /* journal write — best effort */ }
    }
    // Decrement xp buff after every question (correct or wrong) so it ticks
    // down naturally over the next 3 trials.
    if (xpBuffRemaining > 0) setXpBuffRemaining((n) => Math.max(0, n - 1));
    if (correct) {
      // Phase 22: a thwack lands on the foe.
      playSfx('hit');
      // Phase 19: regen +1 mana per correct answer, capped at maxMana.
      setMana((m) => Math.min(maxMana, m + 1));
      // Clear any reveal hint once the question resolves.
      setRevealedAnswer(null);
      const scoreGain = 1 + (battle?.type === 'mob' ? equipBonuses.mobScoreBonus : 0);
      setScore((s) => s + scoreGain);
      setStreak((s) => {
        const next = s + 1;
        setMaxStreak((m) => Math.max(m, next));
        return next;
      });
      const buffMul = xpBuffRemaining > 0 ? 1.25 : 1;
      if (battle?.type === 'mob') {
        const tierMul = battle.mobTier === 'elite' ? 2 : 1;
        // XP is deferred to end-of-run so death can halve it.
        xpEarnedRef.current += Math.floor(10 * equipBonuses.xpMul * buffMul * tierMul);
        if (awardGold) awardGold(Math.floor(5 * equipBonuses.goldMul * tierMul), 'Foe felled');
      } else if (battle?.type === 'boss') {
        xpEarnedRef.current += Math.floor(15 * equipBonuses.xpMul * buffMul);
      }
    } else {
      setMistakes((m) => m + 1);
      setStreak(0);
      // Cloak of the Starbound: first wrong answer of the run does no damage.
      if (equipBonuses.firstWrongFree && !firstWrongUsed) {
        setFirstWrongUsed(true);
        // Audible confirmation that the cloak/imp absorbed the wrong —
        // without this the wrong-answer played silently which read as
        // "the game didn't register my answer."
        playSfx('cast');
      } else {
        // Damage scales with whoever just hit you back.
        const dmg = battle?.type === 'boss'
          ? DMG_BY_TIER.boss
          : (battle?.mobTier === 'elite' ? DMG_BY_TIER.elite : DMG_BY_TIER.basic);
        setHp((h) => h - dmg);
        playSfx('hurt');
      }
    }

    // Open-ended HP-based gauntlet (25a-3): the foe only dies when
    // `correctCount` reaches its `maxHp`. Wrong answers cost player HP
    // (handled above) but do NOT advance the kill count — the player just
    // gets a fresh question and tries again.
    const nextCorrect = (battle.correctCount || 0) + (correct ? 1 : 0);
    const slain = nextCorrect >= (battle.maxHp || 1);

    if (battle?.type === 'mob') {
      if (slain) {
        const mob = mobsRef.current[battle.mobIdx];
        mobsRef.current.splice(battle.mobIdx, 1);
        if (mob && recordBestiary) recordBestiary(mob.kind);
        // 25a-5: roll for boss key drop on the kill. 5% basic, 25%
        // elite. Only fires if we don't already have the key.
        if (!bossKeyFound && mob) {
          const dropPct = mob.tier === 'elite' ? 0.25 : 0.05;
          if (Math.random() < dropPct) {
            setBossKeyFound(true);
            showPickup('⚷ Boss Key', '#fde047');
            setNotice({ tone: 'good', text: '⚷ Acquired: Boss Key. The chamber awaits.' });
          }
        }
        setBattle(null);
        return;
      }
      // Foe still standing — pull a fresh question and continue.
      const next = pickOneQuestion(courseSet, usedQuestionIdsRef.current);
      if (next) usedQuestionIdsRef.current.add(next.id);
      setBattle({ ...battle, currentQuestion: next || battle.currentQuestion, correctCount: nextCorrect, previewDomain: takeForesightPreview(foresightChargesRef, next) }); // 17G
      return;
    }

    if (battle?.type === 'boss') {
      if (slain) {
        setBattle(null);
        setTimeout(() => {
          if (stateRef.current.hp > 0) finishRun(true, {});
        }, 0);
        return;
      }
      const next = pickOneQuestion(courseSet, usedQuestionIdsRef.current);
      if (next) usedQuestionIdsRef.current.add(next.id);
      setBattle({ ...battle, currentQuestion: next || battle.currentQuestion, correctCount: nextCorrect, previewDomain: takeForesightPreview(foresightChargesRef, next) }); // 17G
    }
  };

  // Flee a non-boss battle. Costs 1 shield for basic mobs, 2 shields for
  // elites. Removes the mob and closes the modal.
  const onBattleFlee = () => {
    if (!battle || battle.type !== 'mob') return;
    const cost = battle.mobTier === 'elite' ? 2 : 1;
    if (shields < cost) return;
    setShields((s) => s - cost);
    if (typeof battle.mobIdx === 'number') {
      mobsRef.current.splice(battle.mobIdx, 1);
    }
    setBattle(null);
  };

  // Watch HP — if it drops to 0 or below, end the run (or revive once if the
  // Phoenix Ember has been quaffed).
  useEffect(() => {
    if (phase !== 'world' || runState !== 'alive' || hp > 0) return;
    if (reviveAvailable) {
      setReviveAvailable(false);
      setHp(1);
      setNotice({ tone: 'good', text: '🔥 The Phoenix Ember bursts forth — thou art saved.' });
      return;
    }
    setBattle(null);
    finishRun(false, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hp, phase]);

  const finishRun = (won, opts = {}) => {
    if (runState !== 'alive') return;
    const durationSec = (Date.now() - runStartTimeRef.current) / 1000;
    const finalHp = Math.max(0, hp);

    let xpAwarded = 0;
    let goldAwarded = 0;
    const xpEarnedInRun = xpEarnedRef.current;
    if (won) {
      playSfx('victory');
      const completionXp = Math.floor(100 * diffConfig.xpMul * equipBonuses.xpMul);
      const completionGold = Math.floor(100 * diffConfig.goldMul * equipBonuses.goldMul);
      xpAwarded = xpEarnedInRun + completionXp;
      goldAwarded = completionGold;
      if (awardXP && xpAwarded > 0) awardXP(xpAwarded, `${diffConfig.label} Dungeon Cleared`);
      if (awardGold) awardGold(goldAwarded, `${diffConfig.label} Dungeon Cleared`);
      if (checkAchievement) {
        checkAchievement('first_run');
        checkAchievement('first_boss');
        const bossId = initial.boss?.kind;
        if (bossId) {
          const bossAch = `first_${bossId}`;
          checkAchievement(bossAch);
          if (recordBestiary) recordBestiary(bossId);
        }
        if (mistakes === 0) {
          checkAchievement('flawless');
          if (unlockSpecialTitle) unlockSpecialTitle('flawless');
        }
        if (diffConfig.completeAchievement) checkAchievement(diffConfig.completeAchievement);
      }
      if (diffConfig.rewardTitleId && unlockSpecialTitle) unlockSpecialTitle(diffConfig.rewardTitleId);
      if (updateTomeProgress) {
        updateTomeProgress((prev) => ({ runsCompleted: (prev.runsCompleted || 0) + 1, bossesDefeated: (prev.bossesDefeated || 0) + 1 })); // 17D functional form
      }
      if (updateProgress && playerState) {
        updateProgress({ longestStreak: Math.max(playerState.longestStreak || 0, maxStreak) });
      }
    } else {
      playSfx('defeat');
      // Death penalty: half the XP earned in the run, no completion bonus.
      // Gold accumulated mid-run was already paid out per kill so it stays.
      xpAwarded = Math.floor(xpEarnedInRun * 0.5);
      if (xpAwarded > 0 && awardXP) awardXP(xpAwarded, 'Half XP — death penalty');
    }

    // Phase 18: pet XP — equipped pet earns XP scaled by score and victory.
    // Even on death the pet learns from the trial (half-rate). Cap at the
    // current pet max so each delve is meaningful but pets aren't insta-maxed.
    if (awardPetXp && equipped.pet) {
      const base = score * 8 + (won ? 60 : 0);
      const petXp = won ? base : Math.floor(base * 0.5);
      if (petXp > 0) awardPetXp(equipped.pet, petXp);
    }

    // Run history entry — same shape as the legacy DungeonRun for Chronicle compatibility.
    const entry = {
      runId: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString(),
      difficulty,
      bossId: initial.boss?.kind,
      won: !!won,
      score,
      livesRemaining: finalHp,
      maxLives: effectiveMaxHp,
      mistakes,
      maxStreak,
      durationSec,
      modifiers: [],
      totalQuestions: runQuestionLogRef.current.length,
      questionLog: [...runQuestionLogRef.current],
    };
    if (updateTomeProgress) {
      updateTomeProgress((prev) => ({ runHistory: [...(prev.runHistory || []), entry].slice(-100) })); // 17D functional form
    }

    setEndSummary({
      score,
      hp: finalHp,
      maxHp: effectiveMaxHp,
      mistakes,
      maxStreak,
      xpAwarded,
      goldAwarded,
      bossId: initial.boss?.kind,
      earlyByEmptyTome: !!opts.earlyByEmptyTome,
      xpEarnedInRun,
      deathPenaltyApplied: !won && xpEarnedInRun > 0,
    });
    setRunState(won ? 'victory' : 'death');
  };

  // Animation refs.
  const animPosRef = useRef({ x: initial.spawn.x, y: initial.spawn.y });
  const lastPosRef = useRef({ x: initial.spawn.x, y: initial.spawn.y });
  const moveStartRef = useRef(0);

  useEffect(() => {
    animPosRef.current = { x: initial.spawn.x, y: initial.spawn.y };
    lastPosRef.current = { x: initial.spawn.x, y: initial.spawn.y };
    moveStartRef.current = 0;
  }, [initial]);

  useEffect(() => {
    moveStartRef.current = performance.now();
    lastPosRef.current = { ...animPosRef.current };
  }, [pos]);

  // === rAF render loop ===================================================
  // S5: track prefers-reduced-motion (the canvas RAF loop can't be reached by
  // the CSS media query). Used to throttle the loop + freeze ambient motion.
  const reducedMotionRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => { reducedMotionRef.current = mq.matches; };
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  useEffect(() => {
    if (phase !== 'world') return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    let raf;
    let lastFrame = 0;
    const REDUCED_FRAME_MS = 1000 / 15;

    const tick = (now) => {
      // S5: honor prefers-reduced-motion — cap the loop to ~15fps and freeze
      // ambient sprite cycling. Gameplay stays correct (it is time-based on now).
      const reduce = reducedMotionRef.current;
      if (reduce && now - lastFrame < REDUCED_FRAME_MS) { raf = requestAnimationFrame(tick); return; }
      lastFrame = now;
      const s = stateRef.current;
      const target = s.pos;
      const start = lastPosRef.current;
      const t0 = moveStartRef.current || now;
      const t = Math.min(1, (now - t0) / MOVE_MS);
      const eased = t * t * (3 - 2 * t);
      const ax = start.x + (target.x - start.x) * eased;
      const ay = start.y + (target.y - start.y) * eased;
      animPosRef.current = { x: ax, y: ay };

      // Held-key repeat: while a direction is held, fire moves at HOLD_REPEAT_MS
      // cadence. The first move on keydown was already fired in the handler.
      if (!s.battle && s.runState === 'alive' && heldKeysRef.current.size > 0) {
        if (now - lastMoveAtRef.current >= HOLD_REPEAT_MS) {
          // If multiple keys are held, prefer the most recently added (insertion-ordered Set).
          const keys = Array.from(heldKeysRef.current);
          const dir = keys[keys.length - 1];
          const [dx, dy] = DIR_DELTAS[dir];
          setFacing(dir);
          setPos((p) => {
            const nx = p.x + dx;
            const ny = p.y + dy;
            if (ny < 0 || ny >= s.initial.map.length) return p;
            if (nx < 0 || nx >= s.initial.map[0].length) return p;
            if (!isWalkable(s.initial.map[ny][nx])) return p;
            return { x: nx, y: ny };
          });
          lastMoveAtRef.current = now;
        }
      }

      const moving = t < 1;
      const walkFrame = (moving && !reduce) ? Math.floor(now / WALK_FRAME_MS) % 4 : 0;

      // Mob AI — but pause while a battle is open or run is over. Each mob
      // ticks at its own cadence based on `nextMoveAt`. Behavior depends on
      // mob.ai: idle (no move), patrol (bounce one axis), aggressive (chase
      // when player is close, otherwise wander).
      if (!s.battle && s.runState === 'alive') {
        mobsRef.current.forEach((m) => {
          if (m.ai === 'idle') return;
          if (m.nextMoveAt === 0) {
            m.nextMoveAt = now + MOB_MOVE_MIN_MS + Math.random() * (MOB_MOVE_MAX_MS - MOB_MOVE_MIN_MS);
            return;
          }
          if (now < m.nextMoveAt) return;

          const tryStep = (dx, dy) => {
            const nx = m.x + dx;
            const ny = m.y + dy;
            const inBounds = nx >= m.bounds.x && nx < m.bounds.x + m.bounds.w &&
                             ny >= m.bounds.y && ny < m.bounds.y + m.bounds.h;
            if (!inBounds) return false;
            if (s.initial.map[ny]?.[nx] !== TILE.FLOOR) return false;
            if (nx === s.pos.x && ny === s.pos.y) return false;
            // Avoid stepping onto another mob.
            if (mobsRef.current.some((other) => other !== m && other.x === nx && other.y === ny)) return false;
            m.x = nx;
            m.y = ny;
            return true;
          };

          if (m.ai === 'aggressive') {
            const dist = Math.abs(s.pos.x - m.x) + Math.abs(s.pos.y - m.y);
            if (dist > 0 && dist <= MOB_AGGRO_RANGE) {
              const dx = Math.sign(s.pos.x - m.x);
              const dy = Math.sign(s.pos.y - m.y);
              // Try the longer axis first; fall back to the other.
              const horizFirst = Math.abs(s.pos.x - m.x) >= Math.abs(s.pos.y - m.y);
              if (horizFirst) {
                if (!(dx !== 0 && tryStep(dx, 0))) tryStep(0, dy);
              } else {
                if (!(dy !== 0 && tryStep(0, dy))) tryStep(dx, 0);
              }
              // Aggressive mobs tick faster than regular wander.
              m.nextMoveAt = now + 700 + Math.random() * 600;
              return;
            }
          }

          if (m.ai === 'patrol') {
            // Bounce horizontally; flip direction on wall.
            if (!tryStep(m.patrolDir || 1, 0)) {
              m.patrolDir = -(m.patrolDir || 1);
              tryStep(m.patrolDir, 0);
            }
            m.nextMoveAt = now + MOB_MOVE_MIN_MS + Math.random() * (MOB_MOVE_MAX_MS - MOB_MOVE_MIN_MS);
            return;
          }

          // Default wander (basic non-patrol mobs without aggression nearby).
          const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
          const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
          tryStep(dx, dy);
          m.nextMoveAt = now + MOB_MOVE_MIN_MS + Math.random() * (MOB_MOVE_MAX_MS - MOB_MOVE_MIN_MS);
        });
      }

      const cameraX = ax * TILE_PX - CANVAS_W / 2 + TILE_PX / 2;
      const cameraY = ay * TILE_PX - CANVAS_H / 2 + TILE_PX / 2;

      ctx.fillStyle = '#050302';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      const startCol = Math.max(0, Math.floor(cameraX / TILE_PX) - 1);
      const endCol   = Math.min(s.initial.width,  startCol + VIEW_W + 3);
      const startRow = Math.max(0, Math.floor(cameraY / TILE_PX) - 1);
      const endRow   = Math.min(s.initial.height, startRow + VIEW_H + 3);

      for (let y = startRow; y < endRow; y++) {
        for (let x = startCol; x < endCol; x++) {
          const px = x * TILE_PX - cameraX;
          const py = y * TILE_PX - cameraY;
          drawTile(ctx, s.biome, s.initial.map[y][x], px, py, x, y, s.initial.map);
        }
      }

      decorationsRef.current.forEach((d) => {
        if (d.x < startCol - 1 || d.x > endCol || d.y < startRow - 1 || d.y > endRow) return;
        const px = d.x * TILE_PX - cameraX;
        const py = d.y * TILE_PX - cameraY;
        // 25b: lootable plants pulse a soft mint halo to telegraph
        // they're harvestable. Drawn under the sprite so the plant
        // detail still reads cleanly.
        if (LOOTABLE_DECOS[d.kind]) {
          const pulse = 0.18 + 0.16 * Math.sin(now / 320);
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.fillStyle = '#a7f3d0';
          ctx.beginPath();
          ctx.arc(px + TILE_PX / 2, py + TILE_PX / 2, TILE_PX * 0.55, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        const drawer = DECO_DRAWERS[d.kind];
        if (drawer) drawer(ctx, px, py, now);
      });

      // Chests render under mobs/boss/player.
      chestsRef.current.forEach((c) => {
        if (c.x < startCol - 1 || c.x > endCol || c.y < startRow - 1 || c.y > endRow) return;
        const px = c.x * TILE_PX - cameraX;
        const py = c.y * TILE_PX - cameraY;
        drawChest(ctx, c.tier, px, py, c.opened, now);
      });

      if (s.initial.boss) {
        const b = s.initial.boss;
        if (b.x >= startCol - 1 && b.x <= endCol && b.y >= startRow - 1 && b.y <= endRow) {
          const px = b.x * TILE_PX - cameraX;
          const py = b.y * TILE_PX - cameraY;
          const drawer = BOSS_DRAWERS[b.kind];
          if (drawer) drawer(ctx, px, py, now);
        }
      }

      mobsRef.current.forEach((m) => {
        if (m.x < startCol - 1 || m.x > endCol || m.y < startRow - 1 || m.y > endRow) return;
        const px = m.x * TILE_PX - cameraX;
        const py = m.y * TILE_PX - cameraY;
        const drawer = MOB_DRAWERS[m.kind];
        if (drawer) drawer(ctx, px, py, now);
      });

      const ppx = ax * TILE_PX - cameraX;
      const ppy = ay * TILE_PX - cameraY;

      // Phase 18: render the equipped pet trailing the player. The pet sits
      // one tile behind based on facing, with a small forward shimmy so it
      // visually catches up rather than feeling teleported.
      if (s.activePet) {
        const drawer = PET_DRAWERS[s.activePet.def.spriteKey];
        if (drawer) {
          let petTileDx = 0, petTileDy = 0;
          if (s.facing === 'up')    petTileDy = 1;
          if (s.facing === 'down')  petTileDy = -1;
          if (s.facing === 'left')  petTileDx = 1;
          if (s.facing === 'right') petTileDx = -1;
          // If trailing tile is a wall, drift sideways instead so the pet
          // never sits inside scenery.
          const trailX = ax + petTileDx;
          const trailY = ay + petTileDy;
          const tileAt = s.initial.map[Math.round(trailY)]?.[Math.round(trailX)];
          if (tileAt === TILE.WALL) {
            petTileDx = petTileDx === 0 ? 1 : 0;
            petTileDy = petTileDy === 0 ? 1 : 0;
          }
          const petPx = (ax + petTileDx) * TILE_PX - cameraX;
          const petPy = (ay + petTileDy) * TILE_PX - cameraY;
          drawer(ctx, petPx, petPy, now);
        }
      }

      // 25i-3: swingT decays 1 → 0 over the 200ms after a mob/boss bump,
      // letting drawWeapon paint a half-sine arc on top of the player.
      const swingT = Math.max(0, 1 - (now - bumpAtRef.current) / 200);
      drawPlayer(ctx, ppx, ppy, s.facing, walkFrame, s.equipped, swingT);

      const grad = ctx.createRadialGradient(
        CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.4,
        CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.7,
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // HUD — biome name (top-left)
      ctx.font = "16px 'Cinzel', Georgia, serif";
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(8, 8, 320, 28);
      ctx.fillStyle = s.biome.accentSolid;
      ctx.fillText(`${s.biome.icon}  ${s.biome.name}`, 16, 14);

      // HP hearts + shield icons (top-right). Hearts get a fixed slot; shields
      // sit immediately to their left.
      const heartCount = Math.min(s.maxHp, 6);
      const hudHpW = heartCount * 20 + 16 + (s.maxHp > 6 ? 36 : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(CANVAS_W - hudHpW - 8, 8, hudHpW, 28);
      for (let i = 0; i < heartCount; i++) {
        const hx = CANVAS_W - hudHpW + 4 + i * 20;
        const hy = 14;
        ctx.fillStyle = i < s.hp ? '#ef4444' : '#3a1414';
        ctx.beginPath();
        ctx.arc(hx + 5,  hy + 5, 5, 0, Math.PI * 2);
        ctx.arc(hx + 11, hy + 5, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(hx,      hy + 6);
        ctx.lineTo(hx + 16, hy + 6);
        ctx.lineTo(hx + 8,  hy + 16);
        ctx.closePath();
        ctx.fill();
        // Highlight on full heart for crispness
        if (i < s.hp) {
          ctx.fillStyle = '#fca5a5';
          ctx.fillRect(hx + 3, hy + 3, 1, 1);
          ctx.fillRect(hx + 9, hy + 3, 1, 1);
        }
      }
      if (s.maxHp > 6) {
        ctx.fillStyle = '#fde047';
        ctx.font = "11px 'Cinzel', Georgia, serif";
        ctx.fillText(`×${s.hp}/${s.maxHp}`, CANVAS_W - 40, 16);
        ctx.font = "16px 'Cinzel', Georgia, serif";
      }

      // Shields, immediately left of HP. Each shield is rendered in an
      // 18px slot; the shape itself is 12px wide × 14px tall. We center
      // it both horizontally (slot offset = 3) and vertically (sy = 15
      // so the shield's center y matches the heart's center y of 22).
      let leftEdgeOfHud = CANVAS_W - hudHpW - 8;
      if (s.maxShields > 0) {
        const shieldCount = Math.min(s.maxShields, 4);
        const hudShW = shieldCount * 18 + 12;
        const shX = leftEdgeOfHud - hudShW - 6;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(shX, 8, hudShW, 28);
        for (let i = 0; i < shieldCount; i++) {
          const sx = shX + 9 + i * 18; // was shX + 6 → now centered (9 = 6 box pad + 3 slot pad)
          const sy = 15;               // was 12 → centers vertically against the 28-tall box
          ctx.fillStyle = i < s.shields ? '#3b82f6' : '#1e3a5f';
          ctx.beginPath();
          ctx.moveTo(sx,      sy);
          ctx.lineTo(sx + 12, sy);
          ctx.lineTo(sx + 12, sy + 8);
          ctx.lineTo(sx + 6,  sy + 14);
          ctx.lineTo(sx,      sy + 8);
          ctx.closePath();
          ctx.fill();
          if (i < s.shields) {
            ctx.fillStyle = '#fde047';
            ctx.fillRect(sx + 5, sy + 3, 2, 4);
          }
        }
        leftEdgeOfHud = shX;
      }

      // 25a-6c: Boss Key indicator in the top-right HUD, left of shields
      // (or HP if no shields). Same 28-tall box, single slot wide. Was a
      // prefix on the bottom-right score readout — moved here so all
      // status icons live together.
      if (s.bossKeyFound) {
        const keyW = 28;
        const keyX = leftEdgeOfHud - keyW - 6;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(keyX, 8, keyW, 28);
        const cx = keyX + keyW / 2;
        const cy = 22;
        // Bow (round head) — gold ring with a black hole in the center.
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(cx - 4, cy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a0604';
        ctx.beginPath();
        ctx.arc(cx - 4, cy, 2, 0, Math.PI * 2);
        ctx.fill();
        // Shaft + tooth
        ctx.fillStyle = '#fde047';
        ctx.fillRect(cx, cy - 1, 8, 3);
        ctx.fillRect(cx + 5, cy + 2, 2, 3);
      }

      // Score + difficulty (bottom-right). 25a-6c: removed the boss-key
      // prefix here — the key now has its own slot in the top-right HUD.
      ctx.font = "12px 'Cinzel', Georgia, serif";
      const scoreText = `Foes: ${s.score} · ${(DIFFICULTY_LABELS[difficulty]?.label || difficulty)}`;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(CANVAS_W - 220, CANVAS_H - 28, 212, 22);
      ctx.fillStyle = '#fde047';
      ctx.fillText(scoreText, CANVAS_W - 212, CANVAS_H - 24);

      // Coords (bottom-left)
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(8, CANVAS_H - 28, 180, 22);
      ctx.fillStyle = '#a8a29e';
      ctx.fillText(`(${s.pos.x}, ${s.pos.y}) · facing ${FACING_LABELS[s.facing]}`, 16, CANVAS_H - 24);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // ============== Setup screen ==========================================
  if (phase === 'setup') {
    const bossKind = initial.boss?.kind;
    const bossDisp = bossKind ? BOSS_DISPLAY[bossKind] : null;
    const equippedPotions = equipped.potions || [null, null, null];
    const equippedSpells = playerState?.equippedSpells || [null, null, null];
    const inventory = playerState?.inventory || {};
    const itemsList = itemCatalog || [];
    const ownedInSlot = (slotId) =>
      itemsList.filter((it) => it.slot === slotId && (inventory[it.id] || 0) > 0);
    const ownedApothecary =
      itemsList.filter((it) => it.category === 'apothecary' && (inventory[it.id] || 0) > 0);
    const hatchedPets = Object.keys(playerState?.pets || {})
      .map((id) => (petCatalog || []).find((p) => p.id === id))
      .filter(Boolean);
    const knownSpells = Object.keys(playerState?.spellbook || {})
      .map((id) => (spellCatalog || []).find((sp) => sp.id === id))
      .filter(Boolean);
    const canEdit = !!(equipItem && unequipSlot);
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <button onClick={onExit} className="flex items-center gap-2 text-amber-600 hover:text-amber-400 italic">
            <ArrowLeft className="w-4 h-4" /> Return to Hearth
          </button>
          <div className="text-xs italic" style={{ color: biome.accentSolid }}>
            ⚜ Prepare thy delve ⚜
          </div>
        </div>

        <div className="rounded-sm p-5 relative" style={{
          background: `linear-gradient(135deg, rgba(20,10,4,0.9) 0%, rgba(var(--surface-deep, 10, 6, 4),0.97) 100%)`,
          border: `3px double ${biome.accent}`,
          boxShadow: `0 0 30px ${biome.accent}, inset 0 0 30px rgba(0,0,0,0.6)`,
          fontFamily: '"Cinzel", Georgia, serif',
        }}>
          <div className="text-center mb-4">
            <div className="text-3xl mb-1">{biome.icon}</div>
            <h2 className="text-2xl font-bold italic" style={{ color: biome.accentSolid, textShadow: `0 0 12px ${biome.accent}` }}>
              {biome.name}
            </h2>
            <div className="text-xs italic text-amber-700/80 mt-1 max-w-md mx-auto">{biome.flavor}</div>
          </div>

          {/* Difficulty selector. Locked tiers show their unlock requirement
              on hover instead of the generic "Locked" tooltip. */}
          <div className="flex flex-wrap items-center gap-2 justify-center mb-4">
            <span className="text-xs text-amber-700 italic">Trial:</span>
            {Object.entries(DIFFICULTY_LABELS).map(([id, info]) => {
              const unlocked = isUnlocked(id);
              const selected = difficulty === id;
              const unlockHint = (() => {
                if (id === 'adept')  return 'Unlock at level 10 — or complete 5 dungeon delves.';
                if (id === 'master') return "Unlock at level 25 — or earn 'Flawless' + 'First Boss' achievements.";
                if (id === 'mythic') return "Unlock at level 50 — or complete the Master tier.";
                return 'Locked';
              })();
              return (
                <button
                  key={id}
                  disabled={!unlocked}
                  onClick={() => setDifficulty(id)}
                  className="px-3 py-1.5 rounded-sm text-xs italic"
                  style={{
                    background: selected ? 'rgba(var(--surface-amber-strong, 120, 53, 15),0.7)' : 'rgba(31,24,12,0.5)',
                    border: `1px solid ${selected ? 'rgba(245,158,11,0.8)' : 'rgba(var(--surface-amber-strong, 120, 53, 15),0.4)'}`,
                    color: selected ? '#fde047' : (unlocked ? '#a8a29e' : '#52443a'),
                    opacity: unlocked ? 1 : 0.5,
                    cursor: unlocked ? 'pointer' : 'not-allowed',
                  }}
                  title={unlocked ? `${ROOMS_BY_DIFFICULTY[id]} chambers · ${DIFF_CONFIG[id].hp} HP · ${DIFF_CONFIG[id].shields} 🛡️` : unlockHint}
                >
                  {info.icon} {info.label}
                </button>
              );
            })}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center mb-4">
            <div className="p-2 rounded-sm" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(239,68,68,0.4)' }}>
              <div className="text-[10px] uppercase italic text-amber-700">Lives</div>
              <div className="text-xl text-red-400 italic">❤ {effectiveMaxHp}</div>
            </div>
            <div className="p-2 rounded-sm" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(59,130,246,0.4)' }}>
              <div className="text-[10px] uppercase italic text-amber-700">Shields</div>
              <div className="text-xl text-blue-400 italic">🛡 {effectiveMaxShield}</div>
            </div>
            <div className="p-2 rounded-sm" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(245,158,11,0.4)' }}>
              <div className="text-[10px] uppercase italic text-amber-700">XP Mul</div>
              <div className="text-xl text-amber-300 italic">×{(diffConfig.xpMul * equipBonuses.xpMul).toFixed(2)}</div>
            </div>
            <div className="p-2 rounded-sm" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(245,158,11,0.4)' }}>
              <div className="text-[10px] uppercase italic text-amber-700">Gold Mul</div>
              <div className="text-xl text-yellow-300 italic">×{(diffConfig.goldMul * equipBonuses.goldMul).toFixed(2)}</div>
            </div>
          </div>

          {/* Boss preview */}
          {bossDisp && (
            <div className="p-3 rounded-sm mb-4 flex items-center gap-3" style={{
              background: 'rgba(0,0,0,0.4)',
              border: `1px solid ${biome.accent}`,
            }}>
              <div className="text-4xl">{bossDisp.icon}</div>
              <div className="flex-1">
                <div className="text-[10px] uppercase italic text-amber-700">Final foe</div>
                <div className="text-lg italic" style={{ color: biome.accentSolid }}>{bossDisp.name}</div>
                <div className="text-[11px] italic text-amber-100/70">5-question gauntlet · no flight from a dungeon lord</div>
              </div>
            </div>
          )}

          {/* 25c: Loadout — interactive dropdowns. Each select wires into
              the equip/unequip helpers (App.jsx); selections survive Begin
              Delve because playerState is owned at the App level. Falls
              back to the previous read-only summary when the equip props
              aren't passed (test harness, embedded preview). */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">⚔</span>
              <h4 className="text-xs font-bold italic text-amber-200 tracking-wider">Loadout</h4>
              <div className="flex-1 h-px bg-linear-to-r from-amber-700/40 to-transparent" />
              <span className="text-[10px] italic text-amber-700">
                {canEdit ? 'Swap before delve' : 'Manage in The Hoard'}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs italic">
              {[
                { slotId: 'weapon', label: 'Weapon', icon: '⚔️' },
                { slotId: 'head',   label: 'Head',   icon: '👑' },
                { slotId: 'cloak',  label: 'Cloak',  icon: '🌌' },
              ].map(({ slotId, label, icon }) => {
                const owned = ownedInSlot(slotId);
                const cur = equipped[slotId] || null;
                const curItem = cur ? itemsList.find((it) => it.id === cur) : null;
                const summary = curItem ? summarizeEquipItem(curItem.id) || curItem.description : '';
                return (
                  <LoadoutSelect
                    key={slotId}
                    label={label}
                    icon={icon}
                    currentId={cur}
                    items={owned.map((it) => ({ id: it.id, label: it.name, icon: it.icon }))}
                    emptyLabel="— Unequip —"
                    summary={summary}
                    disabled={!canEdit}
                    onChange={(v) => {
                      if (!canEdit) return;
                      if (!v) unequipSlot(slotId);
                      else equipItem(v);
                    }}
                  />
                );
              })}
              <LoadoutSelect
                label="Pet"
                icon="🐾"
                currentId={equipped.pet || null}
                items={hatchedPets.map((p) => ({ id: p.id, label: p.name, icon: p.icon }))}
                emptyLabel="— Dismiss —"
                summary={activePet ? `L${activePet.level} · ${summarizePetPassive(activePet.def, activePet.level)}` : ''}
                disabled={!equipPet || !unequipPet}
                onChange={(v) => {
                  if (!equipPet || !unequipPet) return;
                  if (!v) unequipPet();
                  else equipPet(v);
                }}
              />
            </div>

            {/* Potion quick-slots */}
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">🧪</span>
                <h4 className="text-xs font-bold italic text-amber-200 tracking-wider">Potion Quick-Slots</h4>
                <div className="flex-1 h-px bg-linear-to-r from-amber-700/40 to-transparent" />
                <span className="text-[10px] italic text-amber-700">Hotkeys 1 · 2 · 3</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs italic">
                {[0, 1, 2].map((i) => {
                  const pid = equippedPotions[i];
                  const info = pid ? POTION_INFO[pid] : null;
                  const count = pid ? (inventory[pid] || 0) : 0;
                  return (
                    <LoadoutSelect
                      key={`pot${i}`}
                      label={`Slot ${i + 1}`}
                      icon="🧪"
                      currentId={pid || null}
                      items={ownedApothecary.map((it) => ({
                        id: it.id,
                        label: `${it.name} ×${inventory[it.id] || 0}`,
                        icon: it.icon,
                      }))}
                      emptyLabel="— Empty —"
                      summary={info ? `${info.icon} ×${count}` : ''}
                      disabled={!equipPotion || !unequipPotion}
                      onChange={(v) => {
                        if (!equipPotion || !unequipPotion) return;
                        if (!v) unequipPotion(i);
                        else equipPotion(v, i);
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* 25c: Spell quick-slots — same shape as potions but lifted
                from playerState.spellbook + equippedSpells. */}
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">✨</span>
                <h4 className="text-xs font-bold italic text-amber-200 tracking-wider">Spell Quick-Slots</h4>
                <div className="flex-1 h-px bg-linear-to-r from-amber-700/40 to-transparent" />
                <span className="text-[10px] italic text-amber-700">Hotkeys Z · X · C</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs italic">
                {[0, 1, 2].map((i) => {
                  const sid = equippedSpells[i];
                  const cur = sid ? (spellCatalog || []).find((sp) => sp.id === sid) : null;
                  return (
                    <LoadoutSelect
                      key={`sp${i}`}
                      label={`Slot ${i + 1}`}
                      icon="✨"
                      currentId={sid || null}
                      items={knownSpells.map((sp) => ({ id: sp.id, label: sp.name, icon: sp.icon }))}
                      emptyLabel="— Empty —"
                      summary={cur ? `${cur.cost} mana` : ''}
                      disabled={!equipSpell || !unequipSpell}
                      onChange={(v) => {
                        if (!equipSpell || !unequipSpell) return;
                        if (!v) unequipSpell(i);
                        else equipSpell(v, i);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Begin button */}
          <div className="text-center">
            <button
              onClick={beginRun}
              className="px-6 py-3 rounded-sm font-bold italic text-lg"
              style={{
                background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                color: '#451a03',
                border: '2px solid #fbbf24',
                boxShadow: '0 0 24px rgba(245,158,11,0.5)',
                fontFamily: '"Cinzel", Georgia, serif',
              }}
            >
              ⚔ Begin the Delve ⚔
            </button>
            <div className="mt-2 text-[10px] italic text-amber-700">
              {ROOMS_BY_DIFFICULTY[difficulty]} chambers await · Use 1/2/3 to drink potions in-dungeon
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============== World view ============================================
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button onClick={() => setPhase('setup')} className="flex items-center gap-2 text-amber-600 hover:text-amber-400 italic">
          <ArrowLeft className="w-4 h-4" /> Abandon (back to setup)
        </button>
        <div className="text-xs italic" style={{ color: biome.accentSolid }}>
          {biome.icon} {biome.name} · {DIFFICULTY_LABELS[difficulty]?.label}
        </div>
      </div>

      {/* S3: live region — announces encounters/outcomes for screen readers. */}
      <div className="sr-only" role="status" aria-live="assertive">{liveMsg}</div>
      <div
        ref={containerRef}
        tabIndex={0}
        role="application"
        aria-label="Dungeon delve. Arrow keys or WASD to move, E to interact, Z X or C to cast spells, 1 2 or 3 for potions, Escape to leave."
        className="mx-auto rounded-sm relative select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
        style={{
          width: '100%',
          maxWidth: CANVAS_W,
          aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
          background: '#0a0604',
          border: `3px double ${biome.accent}`,
          boxShadow: `0 0 30px ${biome.accent}, inset 0 0 30px rgba(0,0,0,0.7)`,
          overflow: 'hidden',
        }}
        onClick={() => containerRef.current?.focus()}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            imageRendering: 'pixelated',
          }}
        />
        <BattleModal
          battle={battle}
          biome={biome}
          onAnswer={onBattleAnswer}
          onFlee={onBattleFlee}
          canFlee={shields >= (battle?.mobTier === 'elite' ? 2 : 1)}
          shieldsRemaining={shields}
          hp={hp}
          maxHp={effectiveMaxHp}
          bossDisplay={initial.boss?.kind ? BOSS_DISPLAY[initial.boss.kind] : null}
          // 25d: lets the modal preview "0 dmg" instead of tierDmg when
          // the cloak/imp is about to absorb the next wrong, so the HP
          // bar doesn't fake a drop only to bounce back on commit.
          firstWrongFreeAvailable={equipBonuses.firstWrongFree && !firstWrongUsed}
        />
        <EndRunOverlay
          runState={runState}
          biome={biome}
          summary={endSummary || { score, hp, maxHp: effectiveMaxHp, mistakes, maxStreak, xpAwarded: 0, goldAwarded: 0, bossId: initial.boss?.kind }}
          onExit={() => onExit && onExit()}
          onNewDelve={newDelve}
        />

        {/* Potion HUD — three quick-slot buttons centered at the bottom of the
            canvas. Hotkeys 1/2/3 also fire these. Hidden during battle. */}
        {!battle && runState === 'alive' && (
          <div className="absolute left-1/2 -translate-x-1/2 flex gap-2"
               style={{ bottom: 8, pointerEvents: 'auto' }}>
            {[0, 1, 2].map((i) => {
              const pid = (equipped.potions || [null, null, null])[i];
              const info = pid ? POTION_INFO[pid] : null;
              const count = pid ? ((playerState?.inventory || {})[pid] || 0) : 0;
              const usable = !!info && count > 0;
              return (
                <button
                  key={i}
                  onClick={() => usePotion(i)}
                  disabled={!usable}
                  className="rounded-sm text-center"
                  style={{
                    width: 60, height: 44,
                    background: usable ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.4)',
                    border: `1px solid ${usable ? '#10b981' : 'rgba(var(--surface-amber-strong, 120, 53, 15),0.4)'}`,
                    color: usable ? '#fde047' : '#52443a',
                    cursor: usable ? 'pointer' : 'not-allowed',
                    fontFamily: '"Cinzel", Georgia, serif',
                  }}
                  title={info ? `[${i + 1}] ${info.name} (×${count})` : `Empty quick-slot ${i + 1}`}
                >
                  <div className="text-[10px] italic">[{i + 1}]</div>
                  <div className="text-base leading-none">
                    {info ? `${info.icon}${count > 0 ? `×${count}` : ''}` : '—'}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Spell HUD (Phase 19) — three slots above the potion bar with mana
            orbs to the left. Hotkeys Z/X/C. Visible during battle too so
            auto_correct / reveal_answer can be cast at the question. */}
        {runState === 'alive' && (playerState?.equippedSpells || []).some(Boolean) && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2"
               style={{ bottom: 60, pointerEvents: 'auto' }}>
            <div className="flex items-center gap-1 px-2 py-1 rounded-sm"
                 style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(96, 165, 250, 0.45)' }}
                 title={`Mana: ${mana}/${maxMana}`}>
              {Array.from({ length: maxMana }).map((_, i) => (
                <div key={i} style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: i < mana
                    ? 'radial-gradient(circle at 30% 30%, #93c5fd, #3b82f6 70%)'
                    : 'rgba(30, 41, 59, 0.7)',
                  boxShadow: i < mana ? '0 0 4px rgba(96, 165, 250, 0.7)' : 'none',
                  border: '1px solid rgba(96, 165, 250, 0.3)',
                }} />
              ))}
            </div>
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => {
                const sid = (playerState?.equippedSpells || [null, null, null])[i];
                const info = sid ? (spellCatalog?.find?.(s => s.id === sid) || SPELL_INFO[sid]) : null;
                const cost = info?.cost || 0;
                const canCast = !!info && mana >= cost;
                const hk = ['Z', 'X', 'C'][i];
                return (
                  <button
                    key={i}
                    onClick={() => castSpell(i)}
                    disabled={!info}
                    className="rounded-sm text-center"
                    style={{
                      width: 60, height: 44,
                      background: info && canCast ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.4)',
                      border: `1px solid ${info && canCast ? '#60a5fa' : 'rgba(96, 165, 250, 0.25)'}`,
                      color: info ? (canCast ? '#bae6fd' : '#64748b') : '#52443a',
                      cursor: info ? (canCast ? 'pointer' : 'not-allowed') : 'not-allowed',
                      fontFamily: '"Cinzel", Georgia, serif',
                    }}
                    title={info ? `[${hk}] ${info.name} · ${cost} mana` : `Empty spell-slot ${hk}`}
                  >
                    <div className="text-[10px] italic">[{hk}] {info ? `${cost}m` : ''}</div>
                    <div className="text-base leading-none">{info ? info.icon : '—'}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Reveal hint — shown briefly above the battle modal after Sigil of Clarity. */}
        {revealedAnswer && battle && (
          <div className="absolute left-1/2 -translate-x-1/2 px-3 py-2 rounded-sm text-xs italic"
               style={{
                 top: 110,
                 background: 'rgba(0,0,0,0.85)',
                 border: '1px solid #f472b6',
                 color: '#fbcfe8',
                 pointerEvents: 'none',
                 maxWidth: '80%',
               }}>
            👁️ The truth: {revealedAnswer}
          </div>
        )}

        {/* 25b: harvest prompt. Renders only when standing on a lootable
            plant with no door taking priority. Pure indicator — the
            actual harvest fires through interactWithWorld(). */}
        {!battle && runState === 'alive' && phase === 'world'
          && !isBossDoorAdjacent() && isOnHarvestablePlant() && (
          <div className="absolute left-1/2 -translate-x-1/2"
               style={{ bottom: 110, pointerEvents: 'none' }}>
            <div className="px-3 py-2 rounded-sm text-xs italic"
                 style={{
                   background: 'rgba(0,0,0,0.7)',
                   border: '1px solid rgba(34, 197, 94, 0.6)',
                   color: '#a7f3d0',
                 }}>
              🌿 Press E to harvest
            </div>
          </div>
        )}

        {/* 25a-6b: Boss-door interaction prompt. Renders just above the
            potion bar whenever the player stands next to a sealed door.
            With the key, shows a clickable Unlock button (E hotkey).
            Without, shows the locked-state hint. */}
        {!battle && runState === 'alive' && phase === 'world' && isBossDoorAdjacent() && (
          <div className="absolute left-1/2 -translate-x-1/2"
               style={{ bottom: 110, pointerEvents: 'auto' }}>
            {bossKeyFound ? (
              <button onClick={unlockBossDoorHere}
                className="px-4 py-2 rounded-sm text-sm italic font-bold"
                style={{
                  background: 'linear-gradient(to bottom, #fde047 0%, #b45309 100%)',
                  border: '2px solid #fde047',
                  color: '#1a0e08',
                  boxShadow: '0 0 12px rgba(245, 158, 11, 0.55)',
                  cursor: 'pointer',
                }}>
                ⚷ [E] Unlock Chamber
              </button>
            ) : (
              <div className="px-3 py-2 rounded-sm text-xs italic"
                   style={{
                     background: 'rgba(0,0,0,0.7)',
                     border: '1px solid rgba(var(--surface-amber-strong, 120, 53, 15), 0.6)',
                     color: '#a8a29e',
                     pointerEvents: 'none',
                   }}>
                🔒 Locked. Find a Boss Key.
              </div>
            )}
          </div>
        )}

        {/* Buff indicators top-center */}
        {(reviveAvailable || xpBuffRemaining > 0) && (
          <div className="absolute left-1/2 -translate-x-1/2 flex gap-2"
               style={{ top: 42, pointerEvents: 'none' }}>
            {reviveAvailable && (
              <div className="px-2 py-1 rounded-sm text-[11px] italic"
                   style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid #f97316', color: '#fdba74' }}>
                🔥 Phoenix Ember active
              </div>
            )}
            {xpBuffRemaining > 0 && (
              <div className="px-2 py-1 rounded-sm text-[11px] italic"
                   style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid #fbbf24', color: '#fde047' }}>
                ☕ +25% XP · {xpBuffRemaining} left
              </div>
            )}
          </div>
        )}

        {/* Transient notice banner */}
        {notice && (
          <div className="absolute left-1/2 -translate-x-1/2 px-3 py-2 rounded-sm text-xs italic"
               style={{
                 top: 80,
                 background: 'rgba(0,0,0,0.78)',
                 border: `1px solid ${notice.tone === 'good' ? '#10b981' : '#a8a29e'}`,
                 color: notice.tone === 'good' ? '#a7f3d0' : '#fde68a',
                 pointerEvents: 'none',
                 maxWidth: '80%',
               }}
          >
            {notice.text}
          </div>
        )}

        {/* Floating loot pickup feedback — anchored at the player's screen
            position (always centered since the camera follows). Each label
            floats up + fades over 1.5s via a CSS keyframe animation. */}
        <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
          {floatingPickups.map((p, i) => (
            <div
              key={p.id}
              className="absolute italic font-bold text-sm"
              style={{
                left: '50%',
                top: '46%',
                transform: 'translateX(-50%)',
                color: p.color,
                textShadow: '0 0 8px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.95)',
                animation: `dsLootFloat 1.5s ease-out forwards`,
                animationDelay: `${i * 80}ms`,
                fontFamily: '"Cinzel", Georgia, serif',
                whiteSpace: 'nowrap',
              }}
            >
              {p.text}
            </div>
          ))}
        </div>
        <style>{`
          @keyframes dsLootFloat {
            0%   { opacity: 0;   transform: translate(-50%,   0); }
            15%  { opacity: 1;   transform: translate(-50%,  -8px); }
            85%  { opacity: 0.9; transform: translate(-50%, -36px); }
            100% { opacity: 0;   transform: translate(-50%, -56px); }
          }
        `}</style>
      </div>

      <div className="flex justify-center select-none">
        <div className="grid grid-cols-3 gap-1" style={{ width: 180 }}>
          <div />
          <button onClick={() => tryMove(0, -1, 'up')} className="rounded-sm text-amber-300"
            style={{ background: 'rgba(31,24,12,0.7)', border: '1px solid rgba(var(--surface-amber-strong, 120, 53, 15),0.5)', height: 44 }}>▲</button>
          <div />
          <button onClick={() => tryMove(-1, 0, 'left')} className="rounded-sm text-amber-300"
            style={{ background: 'rgba(31,24,12,0.7)', border: '1px solid rgba(var(--surface-amber-strong, 120, 53, 15),0.5)', height: 44 }}>◀</button>
          <button onClick={() => onExit && onExit()} className="rounded-sm text-amber-700 text-xs italic"
            style={{ background: 'rgba(31,24,12,0.7)', border: '1px solid rgba(var(--surface-amber-strong, 120, 53, 15),0.5)', height: 44 }}>Esc</button>
          <button onClick={() => tryMove(1, 0, 'right')} className="rounded-sm text-amber-300"
            style={{ background: 'rgba(31,24,12,0.7)', border: '1px solid rgba(var(--surface-amber-strong, 120, 53, 15),0.5)', height: 44 }}>▶</button>
          <div />
          <button onClick={() => tryMove(0, 1, 'down')} className="rounded-sm text-amber-300"
            style={{ background: 'rgba(31,24,12,0.7)', border: '1px solid rgba(var(--surface-amber-strong, 120, 53, 15),0.5)', height: 44 }}>▼</button>
          <div />
        </div>
      </div>

      <div className="text-center text-xs italic max-w-xl mx-auto" style={{ color: '#92400e' }}>
        ⚜ {biome.flavor} ⚜
        <div className="text-[10px] text-amber-700/70 mt-1">
          Walk into a foe to engage · Reach the dungeon lord to win the run · Esc to leave
        </div>
        {onViewHistory && (
          <button onClick={onViewHistory} className="mt-2 text-amber-600 hover:text-amber-400 italic underline text-[11px]">
            ⚜ View Chronicle of Delves ⚜
          </button>
        )}
      </div>
    </div>
  );
}
