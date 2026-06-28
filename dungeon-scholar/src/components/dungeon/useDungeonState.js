import { useState } from 'react';

// Run-state cluster for the Dungeon Delve — extracted from the DungeonExplore
// God-file. Groups the in-run combat / progress state (position + facing,
// vitals, mana, score / streak / mistakes, the active battle, the run outcome,
// and the transient screen-reader + banner + floating-pickup UI) into one hook
// so the component shell isn't a wall of useState. Semantics are unchanged:
// these are plain useState values returned with their setters; the initial
// vitals (which derive from difficulty + equipment) and the spawn tile are
// passed in so first-render initialization matches the original exactly.
export function useDungeonState({ spawn, maxHp, maxShields, maxMana }) {
  const [pos, setPos] = useState(spawn);
  const [facing, setFacing] = useState('down');
  const [hp, setHp] = useState(maxHp);
  const [shields, setShields] = useState(maxShields);
  const [firstWrongUsed, setFirstWrongUsed] = useState(false);
  const [bossKeyFound, setBossKeyFound] = useState(false);
  const [mana, setMana] = useState(maxMana);
  const [revealedAnswer, setRevealedAnswer] = useState(null);
  const [reviveAvailable, setReviveAvailable] = useState(false);
  const [xpBuffRemaining, setXpBuffRemaining] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [runState, setRunState] = useState('alive'); // alive | victory | death
  const [battle, setBattle] = useState(null);
  const [liveMsg, setLiveMsg] = useState('');
  const [endSummary, setEndSummary] = useState(null);
  const [notice, setNotice] = useState(null);
  const [floatingPickups, setFloatingPickups] = useState([]);
  return {
    pos,
    setPos,
    facing,
    setFacing,
    hp,
    setHp,
    shields,
    setShields,
    firstWrongUsed,
    setFirstWrongUsed,
    bossKeyFound,
    setBossKeyFound,
    mana,
    setMana,
    revealedAnswer,
    setRevealedAnswer,
    reviveAvailable,
    setReviveAvailable,
    xpBuffRemaining,
    setXpBuffRemaining,
    score,
    setScore,
    streak,
    setStreak,
    maxStreak,
    setMaxStreak,
    mistakes,
    setMistakes,
    runState,
    setRunState,
    battle,
    setBattle,
    liveMsg,
    setLiveMsg,
    endSummary,
    setEndSummary,
    notice,
    setNotice,
    floatingPickups,
    setFloatingPickups,
  };
}
