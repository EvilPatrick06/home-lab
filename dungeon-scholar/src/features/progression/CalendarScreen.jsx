import { useState } from 'react';
import { todayDateStr, dayDiff, computeNextClaim, DAILY_REWARDS } from '../../services/devotion.js';
import { findItem } from '../../game/items.js';

// Phase 20 — Daily Devotion calendar. The scholar earns daily rewards on
// a 7-day cycle; missing a day resets the streak. Day 7 is the capstone
// reward (Phoenix Ember + heavy gold/XP).
function CalendarScreen({ playerState, setScreen, onClaim }) {
  const today = todayDateStr();
  const claimedToday = playerState.lastClaimedDate === today;
  const streak = playerState.loginStreak || 0;
  const longest = playerState.longestLoginStreak || 0;
  const totalLogins = playerState.totalLogins || 0;
  const devotion = playerState.devotion || 0;
  // The day that *would* be claimed if the player presses claim now. Shares
  // computeNextClaim with the actual claim path (17E) so preview ↔ claim never
  // diverge; gap is kept only for the streak-status message below.
  const gap = playerState.lastClaimedDate ? dayDiff(playerState.lastClaimedDate, today) : null;
  const { cycleDay: cycleDayIdx } = computeNextClaim(today, playerState.lastClaimedDate, streak);

  const [feedback, setFeedback] = useState(null);
  const tryClaim = () => {
    const res = onClaim?.();
    if (res && !res.ok) {
      setFeedback({ tone: 'bad', text: res.reason || 'Cannot claim.' });
      setTimeout(() => setFeedback(null), 1800);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-sm relative" style={{
        background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.55) 0%, rgba(10, 6, 4, 0.95) 100%)',
        border: '3px double rgba(245, 158, 11, 0.6)',
        boxShadow: '0 0 30px rgba(245, 158, 11, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
      }}>
        <div className="absolute top-2 left-2 text-amber-300 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-amber-300 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-amber-300 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-amber-300 text-sm">⚜</div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="text-4xl">🕯️</div>
            <div>
              <h2 className="text-2xl font-bold text-amber-200 italic" style={{ textShadow: '0 0 12px rgba(245, 158, 11, 0.4)' }}>
                The Devotion Calendar
              </h2>
              <div className="text-xs text-amber-400 tracking-[0.2em] italic">⚜ DAILY OFFERINGS · CYCLE OF SEVEN ⚜</div>
              <div className="text-xs text-amber-100/70 italic mt-1">
                Each dawn, kindle a flame for thy devotion. Miss a day and the streak resets.
              </div>
            </div>
          </div>
          <button onClick={() => setScreen('home')}
            className="px-3 py-2 rounded-sm text-xs italic border-2 border-amber-700 text-amber-300 hover:bg-amber-900/30"
            style={{ background: 'rgba(41, 24, 12, 0.6)' }}>
            ← Return to the Hearth
          </button>
        </div>
      </div>

      {/* Stats ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div className="p-3 rounded-sm" style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
          <div className="text-[10px] uppercase italic text-amber-700">Current Streak</div>
          <div className="text-lg font-bold italic text-amber-200">🔥 {streak}</div>
        </div>
        <div className="p-3 rounded-sm" style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
          <div className="text-[10px] uppercase italic text-amber-700">Longest</div>
          <div className="text-lg font-bold italic text-amber-200">{longest}</div>
        </div>
        <div className="p-3 rounded-sm" style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
          <div className="text-[10px] uppercase italic text-amber-700">Total Logins</div>
          <div className="text-lg font-bold italic text-amber-200">{totalLogins}</div>
        </div>
        <div className="p-3 rounded-sm" style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(168, 85, 247, 0.5)' }}>
          <div className="text-[10px] uppercase italic text-purple-300">Devotion</div>
          <div className="text-lg font-bold italic text-purple-200">✦ {devotion}</div>
        </div>
      </div>

      {/* Claim button */}
      <div className="p-4 rounded-sm text-center" style={{
        background: claimedToday
          ? 'linear-gradient(135deg, rgba(31, 41, 55, 0.7) 0%, rgba(10, 6, 4, 0.95) 100%)'
          : 'linear-gradient(135deg, rgba(120, 53, 15, 0.6) 0%, rgba(10, 6, 4, 0.95) 100%)',
        border: `2px solid ${claimedToday ? 'rgba(120, 53, 15, 0.4)' : '#fbbf24'}`,
      }}>
        {claimedToday ? (
          <div>
            <div className="text-amber-200 italic mb-1">Today's flame is already lit.</div>
            <div className="text-xs italic text-amber-700">Return tomorrow to continue the cycle.</div>
          </div>
        ) : (
          <div>
            <div className="text-amber-200 italic mb-2">
              {gap === 1 ? `Continue thy streak — Day ${cycleDayIdx} of the cycle awaits.` :
               streak === 0 ? 'Begin thy first devotion.' :
               `Streak broken — start anew at Day ${cycleDayIdx}.`}
            </div>
            <button onClick={tryClaim}
              className="px-6 py-3 rounded-sm text-base italic border-2 font-bold"
              style={{
                background: 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
                border: '2px solid #fbbf24',
                color: '#1a0e08',
                cursor: 'pointer',
                fontFamily: '"Cinzel", Georgia, serif',
              }}>
              🕯️ Claim Today's Devotion
            </button>
            {feedback && (
              <div className="mt-2 text-xs italic text-red-300">{feedback.text}</div>
            )}
          </div>
        )}
      </div>

      {/* 7-day cycle grid */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-base">📅</span>
          <h3 className="text-sm font-bold italic text-amber-300 tracking-wider">The Seven-Day Cycle</h3>
          <div className="flex-1 h-px bg-linear-to-r from-amber-700/50 to-transparent" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          {DAILY_REWARDS.map((reward) => {
            const isToday = reward.day === cycleDayIdx && !claimedToday;
            const isClaimedToday = reward.day === cycleDayIdx && claimedToday;
            const isPast = streak > 0 && reward.day < cycleDayIdx;
            return (
              <div key={reward.day} className="p-3 rounded-sm text-center" style={{
                background: isToday
                  ? 'linear-gradient(135deg, rgba(120, 53, 15, 0.6) 0%, rgba(10, 6, 4, 0.95) 100%)'
                  : isClaimedToday
                  ? 'linear-gradient(135deg, rgba(6, 78, 59, 0.5) 0%, rgba(10, 6, 4, 0.95) 100%)'
                  : 'rgba(0, 0, 0, 0.55)',
                border: `2px ${reward.capstone ? 'double' : 'solid'} ${
                  isToday ? '#fbbf24'
                  : isClaimedToday ? '#10b981'
                  : reward.capstone ? 'rgba(168, 85, 247, 0.5)'
                  : 'rgba(120, 53, 15, 0.4)'
                }`,
                boxShadow: isToday ? '0 0 14px rgba(245, 158, 11, 0.4)' : 'none',
                opacity: isPast && !isClaimedToday ? 0.55 : 1,
              }}>
                <div className="text-[10px] uppercase italic text-amber-700">Day {reward.day}</div>
                <div className={`text-xs italic font-bold ${reward.capstone ? 'text-purple-200' : 'text-amber-200'}`}>
                  {reward.label}
                </div>
                <div className="text-[10px] italic text-amber-300 mt-1 space-y-0.5">
                  <div>+{reward.gold} 🪙</div>
                  <div>+{reward.xp} XP</div>
                  <div className="text-purple-300">+{reward.devotion} ✦</div>
                  {reward.items.length > 0 && (
                    <div className="text-emerald-300">+ {reward.items.map(it => findItem(it.id)?.icon || '?').join(' ')}</div>
                  )}
                </div>
                {isClaimedToday && (
                  <div className="text-[9px] italic text-emerald-400 mt-1">✓ Claimed</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default CalendarScreen;
