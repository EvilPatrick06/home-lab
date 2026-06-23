import { useMemo } from 'react';

import { TITLES, xpForLevel } from '../../game/titles.js';
import {
  DAILY_QUEST_POOL,
  WEEKLY_QUEST_POOL,
  STORY_CHAINS,
  getCounterValue,
  pickDailyQuests,
  pickWeeklyQuests,
  currentWeekStartStr,
} from '../../game/quests.js';
import { RECIPES, findItem, sanctumAtCap } from '../../game/items.js';
import { generateTomeId, normalizeTomeData, blankTomeProgress } from '../../game/tome.js';
import { isSealedTome } from '../../services/sealedTome.js';
import { petLevelFromXp, findPet } from '../../services/pets.js';
import { findSpell } from '../../services/spells.js';
import { DAILY_REWARDS, todayDateStr, evaluateClaim } from '../../services/devotion.js';

// Phase 39F: pure state-mutating player actions extracted verbatim from
// DungeonScholarApp. These handlers read only playerState/setPlayerState/
// showNotif/user (passed in), imported game data/services, and each other.
// They hold no React refs — toast/UI effects (seen* refs, prevLevelRef,
// notifTimeoutRef, welcomeShownRef, fileInputRef) stay in App.
export function usePlayerActions({ playerState, setPlayerState, showNotif, user }) {
  const totalCardsAcrossLib = useMemo(() => playerState.library.reduce((s, t) => s + (t.progress?.cardsReviewed || 0), 0), [playerState.library]);
  const totalLabsAttemptedAcrossLib = useMemo(
    () => playerState.library.reduce((s, t) => s + (t.progress?.labsAttempted || 0), 0),
    [playerState.library]
  );
  const totalOracleAcrossLib = useMemo(() => playerState.library.reduce((s, t) => s + ((t.progress?.chatHistory || []).filter(m => m.role === 'user').length), 0), [playerState.library]);
  const totalRunsAcrossLib = useMemo(() => playerState.library.reduce((s, t) => s + (t.progress?.runsCompleted || 0), 0), [playerState.library]);
  const totalQuizAnsweredAcrossLib = useMemo(() => playerState.library.reduce((s, t) => s + (t.progress?.quizAnswered || 0), 0), [playerState.library]);
  const totalDungeonRunsAttempted = useMemo(() => totalRunsAcrossLib, [totalRunsAcrossLib]);

  const updateProgress = (updates) => {
    setPlayerState(prev => {
      const next = { ...prev, ...updates };
      let leveledUp = false;
      while (next.xp >= xpForLevel(next.level)) {
        next.xp -= xpForLevel(next.level);
        next.level += 1;
        leveledUp = true;
      }
      if (leveledUp) {
        const newTitle = TITLES.find(t => next.level >= t.min && next.level <= t.max);
        if (newTitle && !next.unlockedTitles.includes(newTitle.name)) {
          next.unlockedTitles = [...next.unlockedTitles, newTitle.name];
        }
        const levelMilestones = [
          { lvl: 5, id: 'level_5' },
          { lvl: 10, id: 'level_10' },
          { lvl: 25, id: 'level_25' },
          { lvl: 50, id: 'level_50' },
          { lvl: 100, id: 'level_100' },
        ];
        levelMilestones.forEach(m => {
          if (next.level >= m.lvl && !next.achievements.includes(m.id)) {
            next.achievements = [...next.achievements, m.id];
          }
        });
        const xpMilestones = [
          { amt: 1000, id: 'xp_1k' },
          { amt: 10000, id: 'xp_10k' },
          { amt: 50000, id: 'xp_50k' },
        ];
        xpMilestones.forEach(m => {
          if (next.totalXp >= m.amt && !next.achievements.includes(m.id)) {
            next.achievements = [...next.achievements, m.id];
          }
        });
        // PHASE-17 17C: level-up + milestone toasts now derive from state
        // transitions in effects below (this updater must stay pure — StrictMode
        // double-invokes it, and concurrent rendering may replay it).
      }
      return next;
    });
  };

  // Update active tome's per-tome progress. `updates` is either a plain patch
  // object OR a function of the previous progress (PHASE-17 17D / M4). Prefer the
  // functional form for any read-modify-write (counters, array appends): it runs
  // inside the setPlayerState updater against the live progress, so a concurrent
  // Realtime/BroadcastChannel update applied mid-flow can't be clobbered by a
  // patch derived from a stale render-time `tomeProgress` prop. The function MUST
  // be pure (no side effects) — it may be replayed under StrictMode/concurrent rendering.
  const updateTomeProgress = (updates) => {
    setPlayerState(prev => {
      if (!prev.activeTomeId) return prev;
      return {
        ...prev,
        library: prev.library.map(t => {
          if (t.id !== prev.activeTomeId) return t;
          const patch = typeof updates === 'function' ? updates(t.progress || {}) : updates;
          return { ...t, progress: { ...t.progress, ...patch } };
        }),
      };
    });
  };

  // 26g: per-card spaced-repetition state lives at
  // `tome.progress.cardProgress[cardId]`. Updates target the active
  // tome (the player can only review cards from the active tome).
  const updateCardProgress = (cardId, nextState) => {
    if (!cardId || !nextState) return;
    setPlayerState(prev => {
      if (!prev.activeTomeId) return prev;
      return {
        ...prev,
        library: (prev.library || []).map(t => {
          if (t.id !== prev.activeTomeId) return t;
          const map = { ...((t.progress && t.progress.cardProgress) || {}) };
          map[cardId] = nextState;
          return { ...t, progress: { ...(t.progress || {}), cardProgress: map } };
        }),
      };
    });
  };

  // 26c: set the exam date on any tome (not just the active one) so the
  // Domain Codex can pace study against an arbitrary tome the player is
  // analyzing. Pass null/'' to clear.
  const setTomeExamDate = (tomeId, dateString) => {
    if (!tomeId) return;
    const normalized = (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) ? dateString : null;
    setPlayerState(prev => ({
      ...prev,
      library: (prev.library || []).map(t =>
        t.id === tomeId
          ? { ...t, progress: { ...(t.progress || {}), examDate: normalized } }
          : t
      ),
    }));
  };

  const awardXP = (amount, reason) => {
    updateProgress({
      xp: playerState.xp + amount,
      totalXp: playerState.totalXp + amount,
    });
    if (reason) showNotif(`+${amount} XP — ${reason}`, 'xp');
  };

  const awardGold = (amount, reason) => {
    if (!amount || amount <= 0) return;
    setPlayerState(prev => ({ ...prev, gold: (prev.gold || 0) + amount }));
    if (reason) showNotif(`+${amount} gold — ${reason}`, 'xp');
  };

  // Returns { ok, reason } so the caller can render an error inline.
  const purchaseItem = (itemId) => {
    const item = findItem(itemId);
    if (!item) return { ok: false, reason: 'Unknown ware.' };
    if (item.locked) return { ok: false, reason: 'This ware is sealed until a future age.' };

    const owned = (playerState.inventory || {})[itemId] || 0;
    if (item.oneTime && owned > 0) return { ok: false, reason: 'Thou already ownest this.' };
    if ((item.category === 'sanctum' || item.category === 'devotion' || item.category === 'celestial') && sanctumAtCap(playerState, item)) {
      return { ok: false, reason: 'Thou hast reached the cap of this boon.' };
    }
    // Phase 20: devotion-priced items spend playerState.devotion instead of gold.
    // Phase 23: celestial items spend ascension tokens.
    const usesDevotion = item.category === 'devotion' && typeof item.devotionPrice === 'number';
    const usesTokens = item.category === 'celestial' && typeof item.ascensionPrice === 'number';
    if (usesDevotion) {
      if ((playerState.devotion || 0) < item.devotionPrice) {
        return { ok: false, reason: 'Insufficient devotion to claim this relic.' };
      }
    } else if (usesTokens) {
      if ((playerState.ascensionTokens || 0) < item.ascensionPrice) {
        return { ok: false, reason: 'Insufficient ascension tokens.' };
      }
    } else if ((playerState.gold || 0) < item.price) {
      return { ok: false, reason: 'Insufficient gold to claim this ware.' };
    }

    setPlayerState(prev => {
      const next = {
        ...prev,
        gold: (usesDevotion || usesTokens) ? (prev.gold || 0) : ((prev.gold || 0) - item.price),
        devotion: usesDevotion ? ((prev.devotion || 0) - item.devotionPrice) : (prev.devotion || 0),
        ascensionTokens: usesTokens ? ((prev.ascensionTokens || 0) - item.ascensionPrice) : (prev.ascensionTokens || 0),
        inventory: {
          ...(prev.inventory || {}),
          [item.id]: ((prev.inventory || {})[item.id] || 0) + 1,
        },
      };
      // Sanctum + devotion + celestial all stack into permUpgrades counters.
      if ((item.category === 'sanctum' || item.category === 'devotion' || item.category === 'celestial') && item.permKey) {
        const step = item.step || 1;
        next.permUpgrades = {
          ...(prev.permUpgrades || {}),
          [item.permKey]: ((prev.permUpgrades || {})[item.permKey] || 0) + step,
        };
      }
      // Phase 18: stable eggs auto-hatch into a pet entry on purchase.
      if (item.category === 'stable' && item.petId) {
        next.pets = {
          ...(prev.pets || {}),
          [item.petId]: (prev.pets || {})[item.petId] || {
            hatchedAt: new Date().toISOString(),
            xp: 0,
          },
        };
      }
      // Phase 19: arcanum scrolls add the spell to the spellbook on purchase.
      if (item.category === 'arcanum' && item.spellId) {
        next.spellbook = {
          ...(prev.spellbook || {}),
          [item.spellId]: (prev.spellbook || {})[item.spellId] || {
            learnedAt: new Date().toISOString(),
          },
        };
      }
      return next;
    });
    const costStr = usesDevotion
      ? `${item.devotionPrice} devotion`
      : usesTokens
      ? `${item.ascensionPrice} ascension token${item.ascensionPrice === 1 ? '' : 's'}`
      : `${item.price} gold`;
    setTimeout(() => showNotif(`Acquired: ${item.name} (-${costStr})`, 'success'), 50);
    return { ok: true };
  };

  // Equip an inventory item. Items with no `slot` are not equippable.
  const equipItem = (itemId) => {
    const item = findItem(itemId);
    if (!item || !item.slot) return { ok: false, reason: 'This ware cannot be equipped.' };
    if (item.locked) return { ok: false, reason: 'This ware is sealed until a future age.' };
    if (!((playerState.inventory || {})[itemId] || 0)) return { ok: false, reason: 'Thou dost not own this.' };
    setPlayerState(prev => ({
      ...prev,
      equipped: { ...(prev.equipped || {}), [item.slot]: itemId },
    }));
    setTimeout(() => showNotif(`Equipped: ${item.name}`, 'success'), 50);
    return { ok: true };
  };

  const unequipSlot = (slot) => {
    setPlayerState(prev => ({
      ...prev,
      equipped: { ...(prev.equipped || {}), [slot]: null },
    }));
  };

  // Phase 18: equip a hatched pet by id (must already exist in pets dict).
  const equipPet = (petId) => {
    const pet = findPet(petId);
    if (!pet) return { ok: false, reason: 'Unknown familiar.' };
    if (!((playerState.pets || {})[petId])) {
      return { ok: false, reason: 'Thou hast not hatched this familiar yet.' };
    }
    setPlayerState(prev => ({
      ...prev,
      equipped: { ...(prev.equipped || {}), pet: petId },
    }));
    setTimeout(() => showNotif(`${pet.name} walks at thy side.`, 'success'), 50);
    return { ok: true };
  };

  // Phase 18: dismiss the active pet without forgetting it.
  const unequipPet = () => {
    setPlayerState(prev => ({
      ...prev,
      equipped: { ...(prev.equipped || {}), pet: null },
    }));
  };

  // Phase 18: award XP to a specific pet. Called by DungeonExplore at the
  // end of a delve for whichever pet was equipped at run-start.
  const awardPetXp = (petId, amount) => {
    if (!petId || !amount || amount <= 0) return;
    const pet = findPet(petId);
    if (!pet) return;
    // PHASE-17 17C: compute the level transition from render state so the
    // level-up toast fires from the handler, not inside the (pure) updater.
    const curRender = (playerState.pets || {})[petId] || { xp: 0 };
    const beforeLvlRender = petLevelFromXp(curRender.xp || 0);
    const afterLvlRender = petLevelFromXp((curRender.xp || 0) + amount);
    setPlayerState(prev => {
      const cur = (prev.pets || {})[petId] || { hatchedAt: new Date().toISOString(), xp: 0 };
      const nextXp = (cur.xp || 0) + amount;
      return {
        ...prev,
        pets: {
          ...(prev.pets || {}),
          [petId]: { ...cur, xp: nextXp },
        },
      };
    });
    if (afterLvlRender > beforeLvlRender) {
      setTimeout(() => showNotif(`${pet.name} reached level ${afterLvlRender}!`, 'success'), 50);
    }
  };

  // Phase 20: claim today's daily devotion reward. Returns { ok, reason,
  // reward } so the caller can render the result. Cycles through 7 days,
  // resets the streak if more than one day was missed.
  const claimDailyReward = () => {
    const today = todayDateStr();
    // M13 (17E): delegate the claim decision (same-day guard + monotone
    // clock-rollback fence + streak/cycle math) to the pure evaluator.
    const res = evaluateClaim({
      now: Date.now(),
      today,
      lastClaimedDate: playerState.lastClaimedDate,
      lastClaimedAt: playerState.lastClaimedAt,
      loginStreak: playerState.loginStreak,
    });
    if (!res.ok) return res;
    const { newStreak, cycleDay } = res;
    const reward = DAILY_REWARDS[cycleDay - 1];
    if (!reward) return { ok: false, reason: 'Reward table missing.' };
    const claimedAt = Date.now();
    setPlayerState(prev => {
      const inv = { ...(prev.inventory || {}) };
      (reward.items || []).forEach(({ id, n }) => {
        inv[id] = (inv[id] || 0) + n;
      });
      return {
        ...prev,
        gold: (prev.gold || 0) + (reward.gold || 0),
        xp: (prev.xp || 0) + (reward.xp || 0),
        totalXp: (prev.totalXp || 0) + (reward.xp || 0),
        devotion: (prev.devotion || 0) + (reward.devotion || 0),
        inventory: inv,
        lastClaimedDate: today,
        lastClaimedAt: claimedAt, // M13: monotone fence stamp
        loginStreak: newStreak,
        longestLoginStreak: Math.max(prev.longestLoginStreak || 0, newStreak),
        totalLogins: (prev.totalLogins || 0) + 1,
        cycleDay,
      };
    });
    setTimeout(() => showNotif(`Day ${cycleDay} claimed: +${reward.gold} gold, +${reward.xp} XP, +${reward.devotion} devotion`, 'success'), 50);
    return { ok: true, reward };
  };

  // Phase 23: ascend the scholar. Resets level/XP/gold/inventory and
  // un-equips current loadout, but preserves identity (achievements,
  // titles, bestiary, pets, spellbook, calendar progress, ascension
  // history). Awards +1 ascension token. Threshold = level 50.
  const ASCENSION_LEVEL_REQ = 50;
  const canAscend = (playerState.level || 1) >= ASCENSION_LEVEL_REQ;
  const ascend = () => {
    if (!canAscend) {
      return { ok: false, reason: `Reach level ${ASCENSION_LEVEL_REQ} to transcend the cycle.` };
    }
    setPlayerState(prev => {
      // Inventory: keep ingredient stacks (they're hard to regrind) but
      // wipe consumable potions and one-time gear acquired this cycle.
      const newInv = {};
      Object.entries(prev.inventory || {}).forEach(([id, n]) => {
        const item = findItem(id);
        if (item && item.category === 'ingredient') newInv[id] = n;
      });
      return {
        ...prev,
        level: 1,
        xp: 0,
        // totalXp keeps so the meta-progression bar reflects all-time effort.
        gold: 0,
        inventory: newInv,
        equipped: { weapon: null, head: null, cloak: null, pet: null, potions: [null, null, null] },
        equippedSpells: [null, null, null],
        // permUpgrades wipe the gold/cycle ones; celestial fonts persist
        // because their permKeys start with "asc". Same for devotion.
        permUpgrades: Object.fromEntries(
          Object.entries(prev.permUpgrades || {}).filter(([k]) =>
            k.startsWith('asc') || ['petXpBonus', 'devoGoldPct', 'fullLoreOnFirst'].includes(k))
        ),
        ascensions: (prev.ascensions || 0) + 1,
        ascensionTokens: (prev.ascensionTokens || 0) + 1,
        lastAscendedAt: new Date().toISOString(),
      };
    });
    setTimeout(() => showNotif('Thou hast ascended! +1 Ascension Token granted.', 'success'), 50);
    return { ok: true };
  };

  // Phase 19: equip a known spell to one of three quick-slots. If slotIdx
  // is omitted, fills the first empty slot. Same shape as equipPotion.
  const equipSpell = (spellId, slotIdx) => {
    const spell = findSpell(spellId);
    if (!spell) return { ok: false, reason: 'Unknown incantation.' };
    if (!((playerState.spellbook || {})[spellId])) {
      return { ok: false, reason: 'Thou hast not learned this spell.' };
    }
    let placed = false;
    setPlayerState(prev => {
      const slots = [...(prev.equippedSpells || [null, null, null])];
      if (typeof slotIdx === 'number') {
        slots[slotIdx] = spellId;
        placed = true;
      } else {
        const empty = slots.findIndex(s => !s);
        if (empty < 0) return prev;
        slots[empty] = spellId;
        placed = true;
      }
      return { ...prev, equippedSpells: slots };
    });
    if (placed) setTimeout(() => showNotif(`Quick-slotted: ${spell.name}`, 'success'), 50);
    return placed ? { ok: true } : { ok: false, reason: 'No empty spell-slot.' };
  };

  const unequipSpell = (slotIdx) => {
    setPlayerState(prev => {
      const slots = [...(prev.equippedSpells || [null, null, null])];
      slots[slotIdx] = null;
      return { ...prev, equippedSpells: slots };
    });
  };

  // Equip an apothecary item into a specific potion slot (0/1/2). If
  // slotIdx is omitted, fills the first empty slot.
  const equipPotion = (itemId, slotIdx) => {
    const item = findItem(itemId);
    if (!item || item.category !== 'apothecary') {
      return { ok: false, reason: 'Only potions and elixirs can be quick-slotted.' };
    }
    if (!((playerState.inventory || {})[itemId] || 0)) {
      return { ok: false, reason: 'Thou dost not own this.' };
    }
    let placed = false;
    setPlayerState(prev => {
      const potions = [...(prev.equipped?.potions || [null, null, null])];
      if (typeof slotIdx === 'number') {
        potions[slotIdx] = itemId;
        placed = true;
      } else {
        const empty = potions.findIndex(p => !p);
        if (empty < 0) return prev;
        potions[empty] = itemId;
        placed = true;
      }
      return { ...prev, equipped: { ...(prev.equipped || {}), potions } };
    });
    if (placed) setTimeout(() => showNotif(`Quick-slotted: ${item.name}`, 'success'), 50);
    return placed ? { ok: true } : { ok: false, reason: 'No empty quick-slot.' };
  };

  const unequipPotion = (slotIdx) => {
    setPlayerState(prev => {
      const potions = [...(prev.equipped?.potions || [null, null, null])];
      potions[slotIdx] = null;
      return { ...prev, equipped: { ...(prev.equipped || {}), potions } };
    });
  };

  // Phase 17: increment a Bestiary entry on first/each defeat. Records
  // the first-defeated date so future analytics can show progression.
  const recordBestiary = (kind) => {
    if (!kind) return;
    setPlayerState(prev => {
      const b = { ...(prev.bestiary || {}) };
      const cur = b[kind] || { defeats: 0, firstDefeatedAt: null };
      b[kind] = {
        defeats: (cur.defeats || 0) + 1,
        firstDefeatedAt: cur.firstDefeatedAt || new Date().toISOString(),
      };
      return { ...prev, bestiary: b };
    });
  };

  // 25j: bumped from DungeonExplore each time a spell-cast pay() succeeds
  // or harvestHere fires. Drives the post-Phase-16 daily/weekly quests.
  const recordSpellCast = () => {
    setPlayerState(prev => ({ ...prev, spellsCast: (prev.spellsCast || 0) + 1 }));
  };
  const recordHarvest = () => {
    setPlayerState(prev => ({ ...prev, plantsHarvested: (prev.plantsHarvested || 0) + 1 }));
  };

  // Phase 16: spend ingredients to brew a potion. Returns { ok, reason }.
  const craftRecipe = (recipeId) => {
    const recipe = RECIPES.find(r => r.id === recipeId);
    if (!recipe) return { ok: false, reason: 'Unknown recipe.' };
    const inv = playerState.inventory || {};
    const missing = Object.entries(recipe.ingredients).filter(([id, n]) => (inv[id] || 0) < n);
    if (missing.length > 0) {
      const first = findItem(missing[0][0]);
      return { ok: false, reason: `Need more ${first?.name || missing[0][0]}.` };
    }
    setPlayerState(prev => {
      const next = { ...prev, inventory: { ...(prev.inventory || {}) } };
      Object.entries(recipe.ingredients).forEach(([id, n]) => {
        const cur = next.inventory[id] || 0;
        const after = cur - n;
        if (after <= 0) delete next.inventory[id];
        else next.inventory[id] = after;
      });
      next.inventory[recipe.resultId] = (next.inventory[recipe.resultId] || 0) + 1;
      return next;
    });
    const result = findItem(recipe.resultId);
    setTimeout(() => showNotif(`Brewed: ${result?.name || recipe.name}`, 'success'), 50);
    return { ok: true };
  };

  // Phase 15: add an item to inventory (chest/plant drops, future loot).
  // Posts a notif so the player has a record outside the in-canvas float.
  const giveItem = (itemId, count = 1) => {
    const item = findItem(itemId);
    if (!item) return;
    setPlayerState(prev => {
      const inv = { ...(prev.inventory || {}) };
      inv[itemId] = (inv[itemId] || 0) + count;
      return { ...prev, inventory: inv };
    });
    setTimeout(() => showNotif(`Acquired: ${item.name}${count > 1 ? ` ×${count}` : ''}`, 'success'), 50);
  };

  // Consume one of an inventory item. Used by potion use in the dungeon
  // and by future apothecary effects. Auto-unequips potion slots that
  // referenced the now-zero item.
  const consumeItem = (itemId) => {
    setPlayerState(prev => {
      const inv = { ...(prev.inventory || {}) };
      const cur = inv[itemId] || 0;
      if (cur <= 0) return prev;
      const next = { ...prev };
      if (cur <= 1) {
        delete inv[itemId];
        const potions = (prev.equipped?.potions || [null, null, null]).map(p => p === itemId ? null : p);
        next.equipped = { ...(prev.equipped || {}), potions };
      } else {
        inv[itemId] = cur - 1;
      }
      next.inventory = inv;
      return next;
    });
  };

  const ACHIEVEMENT_GOLD = 50;
  const checkAchievement = (id) => {
    setPlayerState(prev => {
      if (prev.achievements.includes(id)) return prev;
      // Pure updater (PHASE-17 17C): grant the id + gold; the toast derives from
      // the achievements-transition effect below so StrictMode can't double-fire it.
      return {
        ...prev,
        achievements: [...prev.achievements, id],
        gold: (prev.gold || 0) + ACHIEVEMENT_GOLD,
      };
    });
  };

  const unlockSpecialTitle = (id) => {
    setPlayerState(prev => {
      if (prev.unlockedTitles.includes(id)) return prev;
      // Pure updater (PHASE-17 17C): the toast derives from the titles-transition effect below.
      return { ...prev, unlockedTitles: [...prev.unlockedTitles, id] };
    });
  };

  // Records one answered question across all modes (Quiz, Lab, Dungeon).
  //
  // Signature: (correct: boolean, item: { id, _type?, ...})
  //
  // - `correct` is a literal boolean — call sites must coerce. Passing an
  //   object here makes it truthy and silently inflates totalCorrect.
  // - `item` carries the dedup key (`id`) used by mistakeVault. Quiz mode
  //   passes the full quiz item (`q`). Lab mode passes a synthesized
  //   step item with id `${labId}_step_${idx}` so per-stage failures
  //   accumulate distinct vault entries. Dungeon mode passes the full
  //   quiz item — same shape as Quiz.
  const recordAnswer = (correct, item, extra = {}) => {
    setPlayerState(prev => {
      const newAnswered = prev.totalAnswered + 1;
      const newCorrect = prev.totalCorrect + (correct ? 1 : 0);
      // +1 gold per correct answer (Phase 6). Silent — no per-answer notif.
      const newGold = (prev.gold || 0) + (correct ? 1 : 0);
      let next = { ...prev, totalAnswered: newAnswered, totalCorrect: newCorrect, gold: newGold };

      // I2: real cross-mode correct-answer streak. Increment on a correct
      // answer, reset to 0 on a wrong one; record the best streak reached in
      // the current day/week window (reset at rollover) and all-time.
      const streak = correct ? (prev.currentStreak || 0) + 1 : 0;
      next.currentStreak = streak;
      next.maxStreakToday = Math.max(prev.maxStreakToday || 0, streak);
      next.maxStreakWeek = Math.max(prev.maxStreakWeek || 0, streak);
      next.longestStreak = Math.max(prev.longestStreak || 0, streak);

      // 26a: confidence calibration. When the caller passes a confidence
      // bucket ('low'/'med'/'high'), bump the matching tile on the active
      // tome's confidenceStats. Defensive: legacy callers that don't pass
      // extra still work; unknown buckets are ignored.
      const confidenceBucket = extra && typeof extra.confidence === 'string'
        ? extra.confidence.toLowerCase()
        : null;
      if (confidenceBucket && ['low', 'med', 'high'].includes(confidenceBucket) && prev.activeTomeId) {
        next = {
          ...next,
          library: next.library.map(t => {
            if (t.id !== prev.activeTomeId) return t;
            const base = t.progress?.confidenceStats || {
              low:  { total: 0, correct: 0 },
              med:  { total: 0, correct: 0 },
              high: { total: 0, correct: 0 },
            };
            const tile = base[confidenceBucket] || { total: 0, correct: 0 };
            return {
              ...t,
              progress: {
                ...t.progress,
                confidenceStats: {
                  ...base,
                  [confidenceBucket]: {
                    total: tile.total + 1,
                    correct: tile.correct + (correct ? 1 : 0),
                  },
                },
              },
            };
          }),
        };
      }

      // Bump labsAttempted on every lab answer (success or failure) for tutorial detection.
      if (item && item._type === 'lab' && prev.activeTomeId) {
        next = {
          ...next,
          library: next.library.map(t =>
            t.id === prev.activeTomeId
              ? {
                  ...t,
                  progress: {
                    ...t.progress,
                    labsAttempted: (t.progress?.labsAttempted || 0) + 1,
                  },
                }
              : t
          ),
        };
      }

      // Add to active tome's mistake vault if wrong
      if (!correct && item && prev.activeTomeId) {
        next = {
          ...next,
          library: next.library.map(t => {
            if (t.id !== prev.activeTomeId) return t;
            if (!item.id) return t; // M3 (17E): malformed tome item without an id — never vault it (id-less entries alias each other, and the vault UI/de-vault flow key on m.id so they could never be redeemed)
            const existing = (t.progress?.mistakeVault || []).find(m => m.id === item.id);
            if (existing) return t;
            return {
              ...t,
              progress: {
                ...t.progress,
                mistakeVault: [...(t.progress?.mistakeVault || []), { ...item, addedAt: Date.now() }],
              },
            };
          }),
        };
      }

      // Phase 30e QA #10: bump per-domain answer stats so the Domain Codex
      // can credit Quiz/Riddle/Flashcard/Lab activity, not just dungeon
      // delves. Skipped when item has no `domain` (legacy or non-tagged).
      const itemDomain = item && typeof item.domain === 'string' ? item.domain : null;
      if (itemDomain && prev.activeTomeId) {
        next = {
          ...next,
          library: next.library.map(t => {
            if (t.id !== prev.activeTomeId) return t;
            const ds = { ...(t.progress?.domainStats || {}) };
            const cur = ds[itemDomain] || { total: 0, correct: 0 };
            ds[itemDomain] = { total: cur.total + 1, correct: cur.correct + (correct ? 1 : 0) };
            return { ...t, progress: { ...t.progress, domainStats: ds } };
          }),
        };
      }

      // Volume / accuracy achievement checks
      const volumeMilestones = [
        { amt: 50, id: 'fifty_correct' },
        { amt: 100, id: 'centurion' },
        { amt: 500, id: 'five_hundred' },
        { amt: 1000, id: 'thousand' },
      ];
      volumeMilestones.forEach(m => {
        if (newCorrect >= m.amt && !next.achievements.includes(m.id)) {
          next.achievements = [...next.achievements, m.id]; // toast via the central achievements effect (17C)
        }
      });
      const accuracy = newCorrect / newAnswered;
      const accChecks = [
        { count: 100, acc: 0.8, id: 'sage' },
        { count: 100, acc: 0.9, id: 'oracle_blessed' },
        { count: 200, acc: 0.95, id: 'enlightened' },
      ];
      accChecks.forEach(c => {
        if (newAnswered >= c.count && accuracy >= c.acc && !next.achievements.includes(c.id)) {
          next.achievements = [...next.achievements, c.id]; // toast via the central achievements effect (17C)
        }
      });
      return next;
    });
  };

  const removeFromVault = (idOrItem) => {
    // Phase 42d round-9 P4: accept either the legacy id-string OR the full
    // item object so the caller can pass the item for the undo toast.
    const id = typeof idOrItem === 'string' ? idOrItem : idOrItem?.id;
    const itemForUndo = typeof idOrItem === 'object' ? idOrItem : null;
    setPlayerState(prev => {
      if (!prev.activeTomeId) return prev;
      const newBanished = (prev.vaultBanished || 0) + 1;
      const next = {
        ...prev,
        vaultBanished: newBanished,
        library: prev.library.map(t =>
          t.id === prev.activeTomeId
            ? { ...t, progress: { ...t.progress, mistakeVault: (t.progress?.mistakeVault || []).filter(m => m.id !== id) } }
            : t
        ),
      };
      if (newBanished >= 25 && !next.achievements.includes('vault_warrior')) {
        next.achievements = [...next.achievements, 'vault_warrior']; // toast via the central achievements effect (17C)
      }
      return next;
    });
    // Phase 42d: undo toast — clicking it within ~4s restores the item to
    // the active tome's vault and rolls back the +5 XP / +1 vaultBanished
    // counter. Only available when caller passed the full item.
    if (itemForUndo) {
      const stem = (itemForUndo.question || itemForUndo.front || itemForUndo.term || itemForUndo.title || 'item').slice(0, 50);
      // Phase 44c: 4s → 8s default. Phase 45d: 8s → 10s + Ctrl+Z global
      // hotkey (see notification effect below). Hover/focus pause stays
      // in the notification render block.
      showNotif(
        `Vanquished: ${stem}${stem.length === 50 ? '…' : ''} · Undo (Ctrl+Z)`,
        'success',
        () => {
          setPlayerState(prev => {
            if (!prev.activeTomeId) return prev;
            const tomeNow = prev.library.find(t => t.id === prev.activeTomeId);
            const vaultNow = tomeNow?.progress?.mistakeVault || [];
            // Avoid duplicate restore if user spams undo.
            if (vaultNow.some(v => v.id === id)) return prev;
            return {
              ...prev,
              vaultBanished: Math.max(0, (prev.vaultBanished || 0) - 1),
              xp: Math.max(0, (prev.xp || 0) - 5),
              totalXp: Math.max(0, (prev.totalXp || 0) - 5),
              gold: Math.max(0, (prev.gold || 0)),
              library: prev.library.map(t =>
                t.id === prev.activeTomeId
                  ? { ...t, progress: { ...t.progress, mistakeVault: [...vaultNow, itemForUndo] } }
                  : t
              ),
            };
          });
          showNotif('Restored to Tome of Failures', 'info', null, 1500);
        },
        10000,
      );
    }
  };

  const trackDungeonAttempt = () => {
    setPlayerState(prev => ({ ...prev, dungeonAttempts: (prev.dungeonAttempts || 0) + 1 }));
  };

  // Track modes used today (resets with daily quest refresh).
  const trackModeUseDaily = (mode) => {
    setPlayerState(prev => {
      if (prev.modesUsedToday?.includes(mode)) return prev;
      return { ...prev, modesUsedToday: [...(prev.modesUsedToday || []), mode] };
    });
  };

  // Compute current quest progress.
  const dailyQuestStatus = useMemo(() => {
    if (!playerState.dailyQuests) return [];
    return playerState.dailyQuests.quests.map(q => {
      const template = DAILY_QUEST_POOL.find(t => t.id === q.id);
      if (!template) return null;
      const current = getCounterValue(playerState, template.counter);
      // 25j: absolute-mode quests (e.g. "have N spells equipped right
      // now") check current against target directly; the usual diff
      // mechanism is for cumulative counters where you only want to
      // count NEW activity since the quest was issued.
      const rawProgress = template.absolute ? current : Math.max(0, current - q.baseline);
      const complete = rawProgress >= template.target;
      return {
        ...template,
        baseline: q.baseline,
        progress: Math.min(rawProgress, template.target),
        target: template.target,
        complete,
        claimed: q.claimed,
        claimable: complete && !q.claimed,
      };
    }).filter(Boolean);
  }, [playerState.dailyQuests, playerState.library, playerState.totalCorrect, playerState.longestStreak, playerState.vaultBanished, playerState.modesUsedToday, playerState.maxStreakToday, playerState.totalLogins, playerState.pets, playerState.spellsCast, playerState.plantsHarvested, playerState.equippedSpells, playerState.bestiary, playerState.ascensions]);

  const claimQuest = (questId) => {
    setPlayerState(prev => {
      if (!prev.dailyQuests) return prev;
      const quest = prev.dailyQuests.quests.find(q => q.id === questId);
      if (!quest || quest.claimed) return prev;
      const template = DAILY_QUEST_POOL.find(t => t.id === questId);
      if (!template) return prev;
      const current = getCounterValue(prev, template.counter);
      const progress = template.absolute ? current : current - quest.baseline;
      if (progress < template.target) return prev;
      const xp = template.xp;
      const gold = Math.max(1, Math.floor(xp * 0.1));
      setTimeout(() => showNotif(`+${xp} XP, +${gold} gold — ${template.title}`, 'xp'), 50);
      return {
        ...prev,
        xp: prev.xp + xp,
        totalXp: prev.totalXp + xp,
        gold: (prev.gold || 0) + gold,
        dailyQuests: {
          ...prev.dailyQuests,
          quests: prev.dailyQuests.quests.map(q => q.id === questId ? { ...q, claimed: true } : q),
        },
      };
    });
    // Re-trigger level-up check after XP grant.
    setTimeout(() => updateProgress({}), 100);
  };

  const claimAllQuests = () => {
    dailyQuestStatus.filter(q => q.claimable).forEach(q => claimQuest(q.id));
  };

  const weeklyQuestStatus = useMemo(() => {
    if (!playerState.weeklyQuests) return [];
    return playerState.weeklyQuests.quests.map(q => {
      const template = WEEKLY_QUEST_POOL.find(t => t.id === q.id);
      if (!template) return null;
      const current = getCounterValue(playerState, template.counter);
      const rawProgress = template.absolute ? current : Math.max(0, current - q.baseline);
      const complete = rawProgress >= template.target;
      return {
        ...template,
        baseline: q.baseline,
        progress: Math.min(rawProgress, template.target),
        target: template.target,
        complete,
        claimed: q.claimed,
        claimable: complete && !q.claimed,
      };
    }).filter(Boolean);
  }, [playerState.weeklyQuests, playerState.maxStreakWeek, playerState.library, playerState.totalCorrect, playerState.longestStreak, playerState.vaultBanished, playerState.totalLogins, playerState.pets, playerState.spellsCast, playerState.plantsHarvested, playerState.equippedSpells, playerState.bestiary, playerState.ascensions]);

  const claimWeeklyQuest = (questId) => {
    setPlayerState(prev => {
      if (!prev.weeklyQuests) return prev;
      const quest = prev.weeklyQuests.quests.find(q => q.id === questId);
      if (!quest || quest.claimed) return prev;
      const template = WEEKLY_QUEST_POOL.find(t => t.id === questId);
      if (!template) return prev;
      const current = getCounterValue(prev, template.counter);
      const progress = template.absolute ? current : current - quest.baseline;
      if (progress < template.target) return prev;
      const xp = template.xp;
      const gold = Math.max(1, Math.floor(xp * 0.1));
      setTimeout(() => showNotif(`+${xp} XP, +${gold} gold — ${template.title}`, 'xp'), 50);
      return {
        ...prev,
        xp: prev.xp + xp,
        totalXp: prev.totalXp + xp,
        gold: (prev.gold || 0) + gold,
        weeklyQuests: {
          ...prev.weeklyQuests,
          quests: prev.weeklyQuests.quests.map(q => q.id === questId ? { ...q, claimed: true } : q),
        },
      };
    });
    setTimeout(() => updateProgress({}), 100);
  };

  const claimAllWeeklyQuests = () => {
    weeklyQuestStatus.filter(q => q.claimable).forEach(q => claimWeeklyQuest(q.id));
  };

  const storyChainStatus = useMemo(() => {
    return STORY_CHAINS.map(chain => {
      const sp = playerState.storyProgress?.[chain.id] || {
        stepIndex: 0, baseline: 0, completed: false, claimedSteps: [],
      };
      const currentStep = sp.stepIndex < chain.steps.length ? chain.steps[sp.stepIndex] : null;
      let progress = 0;
      let claimable = false;
      if (!sp.completed && currentStep) {
        const current = getCounterValue(playerState, currentStep.counter);
        progress = Math.max(0, current - sp.baseline);
        claimable = progress >= currentStep.target;
      }
      return {
        chain,
        stepIndex: sp.stepIndex,
        currentStep,
        progress: currentStep ? Math.min(progress, currentStep.target) : 0,
        target: currentStep?.target || 0,
        claimable,
        completed: sp.completed,
        claimedSteps: sp.claimedSteps || [],
      };
    });
  }, [playerState.storyProgress, playerState.library, playerState.totalCorrect, playerState.longestStreak, playerState.vaultBanished]);

  const claimableStoryStepCount = useMemo(
    () => storyChainStatus.filter(s => s.claimable).length,
    [storyChainStatus]
  );

  const claimStoryStep = (chainId) => {
    setPlayerState(prev => {
      const chain = STORY_CHAINS.find(c => c.id === chainId);
      if (!chain) return prev;
      // Defensive init: if storyProgress is missing (cloud-sync race), treat
      // the chain as freshly started with baseline 0 so existing progress
      // counts. Mirrors the storyChainStatus memo's fallback default.
      let sp = prev.storyProgress?.[chainId];
      if (!sp) {
        sp = { stepIndex: 0, baseline: 0, completed: false, claimedSteps: [] };
      }
      if (sp.completed) return prev;
      const step = chain.steps[sp.stepIndex];
      if (!step) return prev;
      const current = getCounterValue(prev, step.counter);
      if (current - sp.baseline < step.target) return prev;
      const isFinal = sp.stepIndex === chain.steps.length - 1;
      const stepXp = step.xp;
      const bonusXp = isFinal ? (chain.rewardXp || 0) : 0;
      const totalXp = stepXp + bonusXp;
      // Per-step gold tracks XP at 10%. Chain completion grants an explicit
      // chain.rewardGold on top (defaults to 10% of rewardXp if unset).
      const stepGold = Math.max(1, Math.floor(stepXp * 0.1));
      const chainGold = isFinal
        ? (chain.rewardGold ?? Math.floor((chain.rewardXp || 0) * 0.1))
        : 0;
      const totalGold = stepGold + chainGold;
      setTimeout(() => showNotif(`+${stepXp} XP, +${stepGold} gold — ${step.title}`, 'xp'), 50);
      if (isFinal && bonusXp > 0) {
        setTimeout(() => showNotif(`+${bonusXp} XP, +${chainGold} gold — Chain Complete: ${chain.title}`, 'xp'), 200);
      }

      const nextStepIndex = sp.stepIndex + 1;
      const nextStep = chain.steps[nextStepIndex];
      const nextBaseline = nextStep ? getCounterValue(prev, nextStep.counter) : sp.baseline;

      const next = {
        ...prev,
        xp: prev.xp + totalXp,
        totalXp: prev.totalXp + totalXp,
        gold: (prev.gold || 0) + totalGold,
        storyProgress: {
          ...prev.storyProgress,
          [chainId]: {
            stepIndex: nextStepIndex,
            baseline: nextBaseline,
            completed: isFinal,
            claimedSteps: [...(sp.claimedSteps || []), step.id],
          },
        },
      };

      if (isFinal && chain.rewardTitleId && !prev.unlockedTitles.includes(chain.rewardTitleId)) {
        next.unlockedTitles = [...prev.unlockedTitles, chain.rewardTitleId]; // toast via the central titles effect (17C)
      }

      return next;
    });
    setTimeout(() => updateProgress({}), 100);
  };

  // Sum of claimable items across daily, weekly, and story-chain systems.
  const claimableQuestCount = useMemo(
    () =>
      dailyQuestStatus.filter(q => q.claimable).length +
      weeklyQuestStatus.filter(q => q.claimable).length +
      claimableStoryStepCount,
    [dailyQuestStatus, weeklyQuestStatus, claimableStoryStepCount]
  );

  const trackModeUse = (mode) => {
    trackModeUseDaily(mode);
    setPlayerState(prev => {
      if (prev.modesUsed.includes(mode)) return prev;
      const newModes = [...prev.modesUsed, mode];
      const next = { ...prev, modesUsed: newModes };
      if (newModes.length >= 5 && !next.achievements.includes('all_modes')) {
        next.achievements = [...next.achievements, 'all_modes']; // toast via the central achievements effect (17C)
      }
      if (mode === 'flashcards' && !next.achievements.includes('first_card')) {
        next.achievements = [...next.achievements, 'first_card'];
      }
      if (mode === 'chat' && !next.achievements.includes('first_oracle')) {
        next.achievements = [...next.achievements, 'first_oracle'];
      }
      return next;
    });
  };

  // ===== Library Operations =====
  const addTomeToLibrary = (data) => {
    // PHASE-41 41B: a sealed-tome envelope carries only metadata + sealCounts
    // (its content arrays are encrypted away), so it cannot flow through the
    // plain-tome content check / normalizeTomeData below. Validate from the
    // public counts, store the envelope verbatim, and reuse the same
    // auto-activate + achievement logic the unsealed path uses.
    if (isSealedTome(data)) {
      const counts = data.sealCounts || {};
      const sealedTotal = (counts.flashcards || 0) + (counts.quiz || 0) + (counts.labs || 0);
      if (!data.metadata?.title || sealedTotal === 0) {
        showNotif('This tome has no scrolls, riddles, or labs — cannot inscribe', 'error');
        return false;
      }
      setPlayerState(prev => {
        const newEntry = {
          id: generateTomeId(),
          data, // sealed envelope stored AS-IS — never normalized/decrypted at rest
          addedAt: Date.now(),
          lastOpened: Date.now(),
          progress: blankTomeProgress(),
        };
        const shouldActivate = !prev.activeTomeId;
        const next = {
          ...prev,
          library: [...prev.library, newEntry],
          activeTomeId: shouldActivate ? newEntry.id : prev.activeTomeId,
        };
        if (!next.achievements.includes('first_tome')) {
          next.achievements = [...next.achievements, 'first_tome']; // toast via the central achievements effect (17C)
        }
        if (next.library.length >= 3 && !next.achievements.includes('tome_collector')) {
          next.achievements = [...next.achievements, 'tome_collector'];
        }
        if (next.library.length >= 10 && !next.achievements.includes('tome_archivist')) {
          next.achievements = [...next.achievements, 'tome_archivist'];
        }
        return next;
      });
      if (playerState.activeTomeId) {
        const title = data?.metadata?.title || 'untitled';
        setTimeout(() => showNotif(`Tome added: "${title}" — switch from the Library when ready.`, 'info'), 100);
      }
      return true;
    }
    // Phase 30c QA #6: reject content-empty tomes. A tome with no scrolls,
    // riddles, or labs creates dead-end study screens (see QA #7) and the
    // auto-promotion below would have silently kicked the user's existing
    // active tome out for it.
    const flashcards = Array.isArray(data?.flashcards) ? data.flashcards : [];
    const quiz = Array.isArray(data?.quiz) ? data.quiz : [];
    const labs = Array.isArray(data?.labs) ? data.labs : [];
    if (flashcards.length === 0 && quiz.length === 0 && labs.length === 0) {
      showNotif('This tome has no scrolls, riddles, or labs — cannot inscribe', 'error');
      return false;
    }
    setPlayerState(prev => {
      const newEntry = {
        id: generateTomeId(),
        data: normalizeTomeData(data),
        addedAt: Date.now(),
        lastOpened: Date.now(),
        progress: blankTomeProgress(),
      };
      // Phase 30c QA #6: only auto-activate when the user has no active tome.
      // Otherwise silently appending to library is the right default — a
      // surprise activation kicks the player out of their in-progress tome.
      const shouldActivate = !prev.activeTomeId;
      const next = {
        ...prev,
        library: [...prev.library, newEntry],
        activeTomeId: shouldActivate ? newEntry.id : prev.activeTomeId,
      };
      if (!next.achievements.includes('first_tome')) {
        next.achievements = [...next.achievements, 'first_tome']; // toast via the central achievements effect (17C)
      }
      if (next.library.length >= 3 && !next.achievements.includes('tome_collector')) {
        next.achievements = [...next.achievements, 'tome_collector'];
      }
      if (next.library.length >= 10 && !next.achievements.includes('tome_archivist')) {
        next.achievements = [...next.achievements, 'tome_archivist'];
      }
      return next;
    });
    // PHASE-17 17C: the "added, not auto-activated" info toast fires from the
    // handler (computed from render state) rather than inside the updater.
    if (playerState.activeTomeId) {
      const title = data?.metadata?.title || 'untitled';
      setTimeout(() => showNotif(`Tome added: "${title}" — switch from the Library when ready.`, 'info'), 100);
    }
    return true;
  };

  const deleteTome = (tomeId) => {
    setPlayerState(prev => {
      const newLib = prev.library.filter(t => t.id !== tomeId);
      let newActive = prev.activeTomeId;
      if (prev.activeTomeId === tomeId) {
        newActive = newLib.length > 0 ? newLib[0].id : null;
      }
      return { ...prev, library: newLib, activeTomeId: newActive };
    });
  };

  const renameTome = (tomeId, newTitle) => {
    setPlayerState(prev => ({
      ...prev,
      library: prev.library.map(t =>
        t.id === tomeId
          ? { ...t, data: { ...t.data, metadata: { ...t.data.metadata, title: newTitle } } }
          : t
      ),
    }));
  };

  const duplicateTome = (tomeId) => {
    setPlayerState(prev => {
      const source = prev.library.find(t => t.id === tomeId);
      if (!source) return prev;
      const newEntry = {
        id: generateTomeId(),
        data: {
          ...source.data,
          metadata: {
            ...source.data.metadata,
            title: `${source.data.metadata.title} (Copy)`,
          },
        },
        addedAt: Date.now(),
        lastOpened: Date.now(),
        progress: blankTomeProgress(),
      };
      return { ...prev, library: [...prev.library, newEntry] };
    });
    showNotif('Tome duplicated — fresh progress awaits', 'success');
  };

  const updateTomeMetadata = (tomeId, metadataUpdates) => {
    setPlayerState(prev => ({
      ...prev,
      library: prev.library.map(t =>
        t.id === tomeId
          ? { ...t, data: { ...t.data, metadata: { ...t.data.metadata, ...metadataUpdates } } }
          : t
      ),
    }));
  };

  // Phase 40F: per-tome encrypted private notes. `payloadOrNull` is exactly
  // the encryptPayload result ({ v, kdf, iter, salt, iv, ct, updatedAt }) —
  // encrypted at rest in localStorage AND the cloud blob; it rides the
  // existing sync untouched. Passing null drops the notes key entirely.
  const updateTomeNotes = (tomeId, payloadOrNull) => {
    setPlayerState(prev => ({
      ...prev,
      library: prev.library.map(t => t.id === tomeId
        ? (payloadOrNull ? { ...t, notes: payloadOrNull } : (({ notes, ...rest }) => rest)(t))
        : t),
    }));
  };

  return {
    totalCardsAcrossLib,
    totalLabsAttemptedAcrossLib,
    totalOracleAcrossLib,
    totalRunsAcrossLib,
    totalQuizAnsweredAcrossLib,
    totalDungeonRunsAttempted,
    updateProgress,
    updateTomeProgress,
    updateCardProgress,
    setTomeExamDate,
    awardXP,
    awardGold,
    purchaseItem,
    equipItem,
    unequipSlot,
    equipPet,
    unequipPet,
    awardPetXp,
    claimDailyReward,
    canAscend,
    ascend,
    equipSpell,
    unequipSpell,
    equipPotion,
    unequipPotion,
    recordBestiary,
    recordSpellCast,
    recordHarvest,
    craftRecipe,
    giveItem,
    consumeItem,
    checkAchievement,
    unlockSpecialTitle,
    recordAnswer,
    removeFromVault,
    trackDungeonAttempt,
    trackModeUseDaily,
    dailyQuestStatus,
    claimQuest,
    claimAllQuests,
    weeklyQuestStatus,
    claimWeeklyQuest,
    claimAllWeeklyQuests,
    storyChainStatus,
    claimableStoryStepCount,
    claimStoryStep,
    claimableQuestCount,
    trackModeUse,
    addTomeToLibrary,
    deleteTome,
    renameTome,
    duplicateTome,
    updateTomeMetadata,
    updateTomeNotes,
  };
}
