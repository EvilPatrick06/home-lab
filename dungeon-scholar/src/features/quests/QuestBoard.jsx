import { Check, CheckCircle2, Clock, Coins, Gift, Lock, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { formatStoryAction } from '../../game/quests.js';
import { SPECIAL_TITLES } from '../../game/titles.js';

// Reusable card for daily and weekly quests (identical visual treatment).
function QuestCard({ q, onClaim }) {
  const pct = Math.min(100, (q.progress / q.target) * 100);
  const goldReward = Math.max(1, Math.floor(q.xp * 0.1));
  return (
    <div
      className="p-5 rounded-sm relative"
      style={{
        background: q.claimed
          ? 'linear-gradient(135deg, rgba(var(--surface-emerald, 6, 78, 59), 0.5) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.9) 100%)'
          : q.claimable
            ? 'linear-gradient(135deg, rgba(var(--surface-amber-strong, 120, 53, 15), 0.6) 0%, rgba(var(--surface-amber, 41, 24, 12), 0.95) 100%)'
            : 'linear-gradient(135deg, rgba(var(--surface-purple, 31, 12, 41), 0.7) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
        border: q.claimed
          ? '2px solid rgba(16, 185, 129, 0.6)'
          : q.claimable
            ? '3px double rgba(245, 158, 11, 0.8)'
            : '2px solid rgba(126, 34, 206, 0.5)',
        boxShadow: q.claimable
          ? '0 0 25px rgba(245, 158, 11, 0.4), inset 0 0 20px rgba(0,0,0,0.5)'
          : q.claimed
            ? '0 0 15px rgba(16, 185, 129, 0.2), inset 0 0 20px rgba(0,0,0,0.5)'
            : '0 0 15px rgba(168, 85, 247, 0.15), inset 0 0 20px rgba(0,0,0,0.5)',
      }}
    >
      <div className="absolute top-1 left-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute top-1 right-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute bottom-1 left-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute bottom-1 right-1 text-amber-700/60 text-xs">⚜</div>

      <div className="flex items-start gap-3 mb-3">
        <div className="text-3xl shrink-0">{q.icon}</div>
        <div className="flex-1 min-w-0">
          <h3
            className="font-bold text-amber-200 italic text-sm"
            style={{ textShadow: '0 0 6px rgba(245, 158, 11, 0.3)' }}
          >
            {q.title}
          </h3>
          <p className="text-xs text-amber-100/70 italic">{q.description.replace('{target}', q.target)}</p>
        </div>
        {q.claimed && (
          <CheckCircle2
            className="w-6 h-6 text-emerald-400 shrink-0"
            style={{ filter: 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.6))' }}
          />
        )}
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-amber-700 italic">Progress</span>
          <span className={q.claimable ? 'text-amber-300 font-bold' : 'text-amber-100/70'}>
            {q.progress}/{q.target}
          </span>
        </div>
        <div
          className="h-2 rounded-full overflow-hidden border border-amber-800"
          style={{ background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)' }}
        >
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: q.claimed
                ? 'linear-gradient(to right, #10b981, #34d399)'
                : q.claimable
                  ? 'linear-gradient(to right, #f59e0b, #fde047)'
                  : 'linear-gradient(to right, #a855f7, #d8b4fe)',
              boxShadow: q.claimable ? '0 0 8px rgba(245, 158, 11, 0.6)' : 'none',
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-purple-300 italic flex items-center gap-2 flex-wrap">
          <span>✦ Reward:</span>
          <span className="text-amber-300 font-bold">+{q.xp} XP</span>
          <span className="text-amber-700">•</span>
          <span className="text-amber-300 font-bold inline-flex items-center gap-0.5">
            <Coins className="w-3 h-3" aria-label="gold" /> +{goldReward}
          </span>
        </div>
        {q.claimed ? (
          <span className="text-xs text-emerald-400 italic font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> CLAIMED
          </span>
        ) : q.claimable ? (
          <button
            onClick={() => onClaim(q.id)}
            className="px-3 py-1.5 rounded-sm text-xs font-bold text-amber-950 border-2 border-amber-300 italic flex items-center gap-1 hover:scale-105 active:scale-95 transition"
            style={{
              background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
              boxShadow: '0 0 12px rgba(245, 158, 11, 0.5)',
            }}
          >
            <Gift className="w-3 h-3" /> Claim
          </button>
        ) : (
          <span className="text-xs text-amber-700/70 italic flex items-center gap-1">
            <Clock className="w-3 h-3" /> In Progress
          </span>
        )}
      </div>
    </div>
  );
}

// One section of the Quest Board (daily OR weekly). Header card + card grid.
function QuestSection({ tagline, subtitle, emptyMsg, quests, onClaim, onClaimAll, claimableCount }) {
  const completed = quests.filter((q) => q.claimed).length;
  const totalXp = quests.reduce((s, q) => s + (q.claimed ? q.xp : 0), 0);
  const possibleXp = quests.reduce((s, q) => s + q.xp, 0);

  return (
    <div className="space-y-4">
      <div
        className="p-5 rounded-sm relative flex items-center justify-between flex-wrap gap-3"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-purple, 31, 12, 41), 0.7) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
          border: '2px solid rgba(168, 85, 247, 0.5)',
          boxShadow: '0 0 25px rgba(168, 85, 247, 0.15), inset 0 0 20px rgba(0,0,0,0.5)',
        }}
      >
        <div className="absolute top-1 left-1 text-purple-400/60 text-xs">⚜</div>
        <div className="absolute top-1 right-1 text-purple-400/60 text-xs">⚜</div>
        <div className="absolute bottom-1 left-1 text-purple-400/60 text-xs">⚜</div>
        <div className="absolute bottom-1 right-1 text-purple-400/60 text-xs">⚜</div>
        <div>
          <div className="text-xs text-purple-400 tracking-[0.2em] italic">{subtitle}</div>
          <div className="text-xs text-amber-100/70 italic mt-1">
            {completed}/{quests.length} claimed • {totalXp}/{possibleXp} XP earned
          </div>
        </div>
        {claimableCount > 0 && (
          <button
            onClick={onClaimAll}
            className="px-4 py-2 rounded-sm text-sm font-bold border-2 border-amber-300 italic flex items-center gap-2 text-amber-950"
            style={{
              background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
              boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)',
            }}
          >
            <Gift className="w-4 h-4" /> Claim All ({claimableCount})
          </button>
        )}
      </div>

      <p className="text-amber-100/70 italic text-sm">{tagline}</p>

      {quests.length === 0 ? (
        <div className="text-center py-12 text-amber-700 italic">{emptyMsg}</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {quests.map((q) => (
            <QuestCard key={q.id} q={q} onClaim={onClaim} />
          ))}
        </div>
      )}
    </div>
  );
}

// One step of a story chain. Three visual states: claimed (narrative revealed),
// current (title + progress, narrative hidden), locked (sealed).
function StoryStepCard({
  step,
  idx,
  status,
  claimable,
  progress,
  target,
  isFinal,
  chainBonusXp,
  chainBonusGold,
  onClaim,
}) {
  // status: 'claimed' | 'current' | 'locked'
  const isClaimed = status === 'claimed';
  const isCurrent = status === 'current';
  const isLocked = status === 'locked';
  const pct = target > 0 ? Math.min(100, (progress / target) * 100) : 0;
  const stepGold = Math.max(1, Math.floor(step.xp * 0.1));
  const _totalXp = step.xp + (isFinal && chainBonusXp ? chainBonusXp : 0);
  const goldReward = isFinal ? stepGold + (chainBonusGold || 0) : stepGold;

  const bg = isClaimed
    ? 'linear-gradient(135deg, rgba(var(--surface-emerald, 6, 78, 59), 0.5) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.9) 100%)'
    : isCurrent && claimable
      ? 'linear-gradient(135deg, rgba(var(--surface-amber-strong, 120, 53, 15), 0.6) 0%, rgba(var(--surface-amber, 41, 24, 12), 0.95) 100%)'
      : isCurrent
        ? 'linear-gradient(135deg, rgba(var(--surface-purple, 31, 12, 41), 0.7) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)'
        : 'linear-gradient(135deg, rgba(15, 8, 20, 0.6) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)';
  const border = isClaimed
    ? '2px solid rgba(16, 185, 129, 0.6)'
    : isCurrent && claimable
      ? '3px double rgba(245, 158, 11, 0.8)'
      : isCurrent
        ? '2px solid rgba(168, 85, 247, 0.55)'
        : '1px solid rgba(60, 35, 80, 0.45)';
  const shadow = isClaimed
    ? '0 0 15px rgba(16, 185, 129, 0.2), inset 0 0 20px rgba(0,0,0,0.5)'
    : isCurrent && claimable
      ? '0 0 25px rgba(245, 158, 11, 0.4), inset 0 0 20px rgba(0,0,0,0.5)'
      : isCurrent
        ? '0 0 15px rgba(168, 85, 247, 0.25), inset 0 0 20px rgba(0,0,0,0.5)'
        : 'inset 0 0 20px rgba(0,0,0,0.5)';

  return (
    <div className="p-4 rounded-sm relative" style={{ background: bg, border, boxShadow: shadow }}>
      <div className="absolute top-1 left-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute top-1 right-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute bottom-1 left-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute bottom-1 right-1 text-amber-700/60 text-xs">⚜</div>

      <div className="flex items-start gap-3">
        <div
          className="shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-bold italic"
          style={{
            borderColor: isClaimed
              ? 'rgba(16, 185, 129, 0.7)'
              : isCurrent
                ? 'rgba(245, 158, 11, 0.7)'
                : 'rgba(60, 35, 80, 0.6)',
            background: isClaimed
              ? 'rgba(var(--surface-emerald, 6, 78, 59), 0.6)'
              : isCurrent
                ? 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.5)'
                : 'rgba(var(--surface-deep, 10, 6, 4), 0.7)',
            color: isClaimed ? '#34d399' : isCurrent ? '#fde047' : '#6b4f8f',
          }}
        >
          {isClaimed ? <Check className="w-4 h-4" /> : isLocked ? <Lock className="w-3.5 h-3.5" /> : idx + 1}
        </div>

        <div className="flex-1 min-w-0">
          <h4
            className={`font-bold italic text-sm ${isLocked ? 'text-amber-700/70' : 'text-amber-200'}`}
            style={!isLocked ? { textShadow: '0 0 6px rgba(245, 158, 11, 0.3)' } : undefined}
          >
            {isLocked ? '— Sealed Until the Path Opens —' : step.title}
            {isFinal && !isLocked && <span className="ml-2 text-xs text-purple-300">✦ FINAL</span>}
          </h4>

          {(isClaimed || isCurrent) && step.narrative && (
            <p
              className={`text-xs italic mt-2 leading-relaxed ${isCurrent ? 'text-amber-100/85' : 'text-amber-100/80'}`}
            >
              {step.narrative}
            </p>
          )}

          {isCurrent && (
            <>
              <div
                className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-bold italic"
                style={{
                  background:
                    'linear-gradient(to bottom, rgba(var(--surface-amber-strong, 120, 53, 15), 0.4), rgba(var(--surface-amber, 41, 24, 12), 0.7))',
                  border: '1px solid rgba(245, 158, 11, 0.5)',
                  color: '#fde047',
                }}
              >
                ✦ Task: {formatStoryAction(step.counter, step.target)}
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-amber-700 italic">Progress</span>
                  <span className={claimable ? 'text-amber-300 font-bold' : 'text-amber-100/70'}>
                    {progress}/{target}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden border border-amber-800"
                  style={{ background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)' }}
                >
                  <div
                    className="h-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: claimable
                        ? 'linear-gradient(to right, #f59e0b, #fde047)'
                        : 'linear-gradient(to right, #a855f7, #d8b4fe)',
                      boxShadow: claimable ? '0 0 8px rgba(245, 158, 11, 0.6)' : 'none',
                    }}
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-between gap-2 mt-3">
            <div
              className={`text-xs italic flex items-center gap-2 flex-wrap ${isLocked ? 'text-amber-700/50' : 'text-purple-300'}`}
            >
              <span>✦ Reward:</span>
              <span className={isLocked ? 'text-amber-700/60' : 'text-amber-300 font-bold'}>+{step.xp} XP</span>
              <span className={isLocked ? 'text-amber-700/40' : 'text-amber-700'}>•</span>
              <span
                className={`font-bold inline-flex items-center gap-0.5 ${isLocked ? 'text-amber-700/60' : 'text-amber-300'}`}
              >
                <Coins className="w-3 h-3" aria-label="gold" /> +{goldReward}
              </span>
              {isFinal && chainBonusXp > 0 && !isLocked && (
                <span className="text-purple-300/80">(includes chain bonus)</span>
              )}
            </div>
            {isClaimed ? (
              <span className="text-xs text-emerald-400 italic font-bold">CLAIMED</span>
            ) : claimable && isCurrent ? (
              <button
                onClick={onClaim}
                className="px-3 py-1.5 rounded-sm text-xs font-bold text-amber-950 border-2 border-amber-300 italic flex items-center gap-1"
                style={{
                  background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                  boxShadow: '0 0 12px rgba(245, 158, 11, 0.5)',
                }}
              >
                <Gift className="w-3 h-3" /> Claim
              </button>
            ) : isCurrent ? (
              <span className="text-xs text-amber-700 italic">In Progress...</span>
            ) : (
              <span className="text-xs text-amber-700/60 italic">Sealed</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// One full story chain: header card with chain title/reward + ordered list of step cards.
function StoryChainView({ chainStatus, onClaimStep }) {
  const { chain, stepIndex, progress, target, claimable, completed, claimedSteps } = chainStatus;
  const totalSteps = chain.steps.length;
  const stepsDone = Math.min(stepIndex, totalSteps);

  return (
    <div className="space-y-4">
      <div
        className="p-5 rounded-sm relative"
        style={{
          background: completed
            ? 'linear-gradient(135deg, rgba(var(--surface-amber-strong, 120, 53, 15), 0.55) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)'
            : 'linear-gradient(135deg, rgba(var(--surface-purple, 31, 12, 41), 0.7) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
          border: completed ? '3px double rgba(245, 158, 11, 0.7)' : '2px solid rgba(126, 34, 206, 0.5)',
          boxShadow: completed
            ? '0 0 25px rgba(245, 158, 11, 0.3), inset 0 0 20px rgba(0,0,0,0.5)'
            : '0 0 15px rgba(168, 85, 247, 0.15), inset 0 0 20px rgba(0,0,0,0.5)',
        }}
      >
        <div className="absolute top-1 left-1 text-amber-700/60 text-xs">⚜</div>
        <div className="absolute top-1 right-1 text-amber-700/60 text-xs">⚜</div>
        <div className="absolute bottom-1 left-1 text-amber-700/60 text-xs">⚜</div>
        <div className="absolute bottom-1 right-1 text-amber-700/60 text-xs">⚜</div>

        <div className="flex items-start gap-4">
          <div className="text-5xl shrink-0">{chain.icon}</div>
          <div className="flex-1 min-w-0">
            <h3
              className="text-xl font-bold text-amber-200 italic"
              style={{ textShadow: '0 0 8px rgba(245, 158, 11, 0.4)' }}
            >
              {chain.title}
            </h3>
            <p className="text-xs text-amber-100/70 italic mt-1">{chain.description}</p>
            <div className="mt-3 flex items-center gap-4 flex-wrap text-xs">
              <span className="text-purple-300 italic">
                Progress:{' '}
                <span className="text-amber-300 font-bold">
                  {stepsDone}/{totalSteps} steps
                </span>
              </span>
              {chain.rewardTitleId && SPECIAL_TITLES[chain.rewardTitleId] && (
                <span className="text-purple-300 italic">
                  ✦ Title Reward:{' '}
                  <span className="text-amber-300 font-bold">{SPECIAL_TITLES[chain.rewardTitleId].name}</span>
                </span>
              )}
              {chain.rewardXp > 0 && (
                <span className="text-purple-300 italic">
                  ✦ Bonus XP: <span className="text-amber-300 font-bold">+{chain.rewardXp}</span>
                </span>
              )}
              {(chain.rewardGold ?? Math.floor((chain.rewardXp || 0) * 0.1)) > 0 && (
                <span className="text-purple-300 italic inline-flex items-center gap-1">
                  ✦ Bonus
                  <span className="text-amber-300 font-bold inline-flex items-center gap-0.5">
                    <Coins className="w-3 h-3" aria-label="gold" /> +
                    {chain.rewardGold ?? Math.floor((chain.rewardXp || 0) * 0.1)}
                  </span>
                </span>
              )}
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden border border-amber-800 mt-3"
              style={{ background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)' }}
            >
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${(stepsDone / totalSteps) * 100}%`,
                  background: completed
                    ? 'linear-gradient(to right, #f59e0b, #fde047)'
                    : 'linear-gradient(to right, #a855f7, #d8b4fe)',
                  boxShadow: completed ? '0 0 8px rgba(245, 158, 11, 0.6)' : 'none',
                }}
              />
            </div>
            {completed && (
              <div className="mt-3 text-emerald-400 italic font-bold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Chain Complete — the path lies behind thee.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {chain.steps.map((step, idx) => {
          const status = completed || idx < stepIndex ? 'claimed' : idx === stepIndex ? 'current' : 'locked';
          const isFinal = step.finalStep || idx === totalSteps - 1;
          return (
            <StoryStepCard
              key={step.id}
              step={step}
              idx={idx}
              status={status}
              claimable={status === 'current' && claimable}
              progress={status === 'current' ? progress : 0}
              target={status === 'current' ? target : 0}
              isFinal={isFinal}
              chainBonusXp={chain.rewardXp || 0}
              chainBonusGold={chain.rewardGold ?? Math.floor((chain.rewardXp || 0) * 0.1)}
              onClaim={() => onClaimStep(chain.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function QuestBoard({
  dailyQuests,
  dailyDate,
  onClaimDaily,
  onClaimAllDaily,
  weeklyQuests,
  weekStart,
  onClaimWeekly,
  onClaimAllWeekly,
  storyChains,
  onClaimStoryStep,
}) {
  const [activeTab, setActiveTab] = useState('daily');

  const dailyClaimable = dailyQuests.filter((q) => q.claimable).length;
  const weeklyClaimable = weeklyQuests.filter((q) => q.claimable).length;
  const storyClaimable = storyChains.filter((s) => s.claimable).length;
  const totalClaimable = dailyClaimable + weeklyClaimable + storyClaimable;

  const tabs = [
    { id: 'daily', label: 'Daily', icon: '☀', claimable: dailyClaimable },
    { id: 'weekly', label: 'Weekly', icon: '🌙', claimable: weeklyClaimable },
    { id: 'story', label: 'Story', icon: '🌟', claimable: storyClaimable },
  ];

  return (
    <div className="space-y-6">
      {/* Top brand header */}
      <div
        className="p-6 rounded-sm relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-purple, 31, 12, 41), 0.7) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
          border: '3px double rgba(168, 85, 247, 0.6)',
          boxShadow: '0 0 40px rgba(168, 85, 247, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
        }}
      >
        <div className="absolute top-2 left-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-purple-400 text-sm">⚜</div>

        <div className="flex items-center gap-3">
          <ScrollText
            className="w-10 h-10 text-purple-300"
            style={{ filter: 'drop-shadow(0 0 10px rgba(168, 85, 247, 0.6))' }}
          />
          <div>
            <h2
              className="text-2xl font-bold text-purple-200 italic"
              style={{ textShadow: '0 0 12px rgba(168, 85, 247, 0.4)' }}
            >
              The Quest Board
            </h2>
            <div className="text-xs text-purple-400 tracking-[0.2em] italic">⚜ DAILY • WEEKLY • STORY ⚜</div>
            {totalClaimable > 0 && (
              <div className="text-xs text-amber-300 italic mt-1 font-bold animate-pulse">
                {totalClaimable} reward{totalClaimable === 1 ? '' : 's'} await{totalClaimable === 1 ? 's' : ''} thy hand
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="px-5 py-2.5 rounded-sm font-bold italic text-sm border-2 flex items-center gap-2 transition"
            style={{
              borderColor: activeTab === t.id ? 'rgba(245, 158, 11, 0.85)' : 'rgba(126, 34, 206, 0.5)',
              background:
                activeTab === t.id
                  ? 'linear-gradient(to bottom, rgba(var(--surface-amber-strong, 120, 53, 15), 0.6), rgba(var(--surface-amber, 41, 24, 12), 0.95))'
                  : 'rgba(var(--surface-purple, 31, 12, 41), 0.5)',
              color: activeTab === t.id ? '#fde047' : '#d8b4fe',
              boxShadow: activeTab === t.id ? '0 0 15px rgba(245, 158, 11, 0.35)' : 'none',
            }}
          >
            <span>{t.icon}</span>
            {t.label}
            {t.claimable > 0 && (
              <span className="bg-amber-500 text-amber-950 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border border-amber-300 animate-pulse">
                {t.claimable}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'daily' && (
        <QuestSection
          subtitle={`⚜ DAILY QUESTS — ${dailyDate || '...'} ⚜`}
          tagline={
            '"Every dawn brings new quests, brave scholar. Complete them to earn experience and grow stronger. Quests refresh at midnight."'
          }
          emptyMsg="The board is bare — return on the morrow for new quests."
          quests={dailyQuests}
          onClaim={onClaimDaily}
          onClaimAll={onClaimAllDaily}
          claimableCount={dailyClaimable}
        />
      )}
      {activeTab === 'weekly' && (
        <QuestSection
          subtitle={`⚜ WEEKLY QUESTS — Week of ${weekStart || '...'} ⚜`}
          tagline={
            '"Greater trials, greater glory. These quests demand the labor of seven days — undertake them with patience, and the rewards shall be plentiful. Refreshes each Monday."'
          }
          emptyMsg="No weekly trials are posted — return when the week renews."
          quests={weeklyQuests}
          onClaim={onClaimWeekly}
          onClaimAll={onClaimAllWeekly}
          claimableCount={weeklyClaimable}
        />
      )}
      {activeTab === 'story' && (
        <div className="space-y-6">
          <p className="text-amber-100/70 italic text-sm">
            "Behold the great chronicles, scholar. Each path is long, each step a verse — walk them, and the legend of
            thy ascent shall be written in starlight."
          </p>
          {storyChains.length === 0 ? (
            <div className="text-center py-12 text-amber-700 italic">No chronicles have yet begun.</div>
          ) : (
            storyChains.map((cs) => (
              <StoryChainView key={cs.chain.id} chainStatus={cs} onClaimStep={onClaimStoryStep} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default QuestBoard;
