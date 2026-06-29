import { useEffect, useLayoutEffect, useRef } from 'react';
import { DIR_DELTAS } from './dungeonLogic.js';

function dirOfKey(key) {
  switch (key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      return 'up';
    case 'ArrowDown':
    case 's':
    case 'S':
      return 'down';
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return 'left';
    case 'ArrowRight':
    case 'd':
    case 'D':
      return 'right';
    default:
      return null;
  }
}

// Keyboard input subsystem for the Dungeon Delve — extracted from the
// DungeonExplore God-file. Owns the held-key set + last-move timestamp (read
// back by the rAF draw loop for held-key repeat) and binds the world-phase
// keydown/keyup handlers. The latest quaff/cast/interact callbacks are reached
// via refs (synced every render) so the listener need not re-subscribe; the
// effect keeps the original [phase, battle, runState, map, onExit] dependency
// list exactly, and `tryMove` is invoked from the effect closure just as before
// (behavior-preserving — not a ref, so its capture semantics are unchanged).
export function useDungeonInput({
  phase,
  battle,
  runState,
  map,
  onExit,
  containerRef,
  tryMove,
  quaffPotion,
  castSpell,
  interactWithWorld,
}) {
  const heldKeysRef = useRef(new Set());
  const lastMoveAtRef = useRef(0);

  // Latest quaffPotion / castSpell / interact via refs so the keydown handler
  // can reach them without restarting on every render.
  const quaffPotionRef = useRef(quaffPotion);
  useLayoutEffect(() => {
    quaffPotionRef.current = quaffPotion;
  });
  const castSpellRef = useRef(castSpell);
  useLayoutEffect(() => {
    castSpellRef.current = castSpell;
  });
  const interactRef = useRef(interactWithWorld);
  useLayoutEffect(() => {
    interactRef.current = interactWithWorld;
  });

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
      if (e.key === 'Escape') {
        if (onExit) onExit();
        return;
      }
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
        quaffPotionRef.current && quaffPotionRef.current(parseInt(e.key, 10) - 1);
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
  }, [phase, battle, runState, map, onExit]);

  return { heldKeysRef, lastMoveAtRef };
}
