import { Check, ChevronDown, ChevronUp, Flame, Gem, Scroll, Swords, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BloomBadge, DifficultyStars } from '../../components/ui/badges.jsx';
import { RecordTile } from '../../components/ui/RecordTile.jsx';
import { BOSS_TYPES, DIFFICULTIES } from '../../game/difficulty.js';
import { blankTomeProgress, formatDuration, summarizeRunHistory } from '../../game/tome.js';
import { formatDateTimeLabel } from '../../utils/date.js';

function RunHistoryScreen({ playerState, setScreen }) {
  const activeTome = playerState.library?.find((t) => t.id === playerState.activeTomeId);
  const tomeProgress = activeTome?.progress || blankTomeProgress();
  const tomeTitle = activeTome?.data?.metadata?.title || 'Unknown Tome';
  const summary = useMemo(() => summarizeRunHistory(tomeProgress.runHistory), [tomeProgress.runHistory]);
  const [expanded, setExpanded] = useState(null); // runId

  // Polish: domain accuracy heatmap. Aggregate every questionLog entry from
  // every recorded run, bucket by domain (or 'Uncategorized' for legacy
  // tomes without per-question domain tags). Sorted by sample size desc so
  // the most-tested domains lead.
  const domainStats = useMemo(() => {
    const buckets = {};
    (tomeProgress.runHistory || []).forEach((run) => {
      (run.questionLog || []).forEach((q) => {
        const key = q.domain || 'Uncategorized';
        const entry = buckets[key] || { domain: key, total: 0, correct: 0 };
        entry.total += 1;
        if (q.correct) entry.correct += 1;
        buckets[key] = entry;
      });
    });
    return Object.values(buckets)
      .map((b) => ({ ...b, accuracy: b.total > 0 ? b.correct / b.total : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [tomeProgress.runHistory]);
  const totalAnswered = domainStats.reduce((s, b) => s + b.total, 0);
  // Polish: per-column sort. sortKey ∈ {date, difficulty, boss, score, streak, duration};
  // sortDir ∈ {asc, desc}. Clicking the same key toggles direction; switching
  // keys defaults to desc (date-desc remains the initial state).
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const DIFF_ORDER = { apprentice: 0, adept: 1, master: 2, mythic: 3 };
  const sorted = useMemo(() => {
    const list = [...summary.runs];
    const keyFn = (r) => {
      switch (sortKey) {
        case 'date':
          return new Date(r.date).getTime();
        case 'difficulty':
          return DIFF_ORDER[r.difficulty] ?? -1;
        case 'boss':
          return r.bossId || '';
        case 'score':
          return r.score || 0;
        case 'streak':
          return r.maxStreak || 0;
        case 'duration':
          return r.durationSec || 0;
        default:
          return 0;
      }
    };
    list.sort((a, b) => {
      const av = keyFn(a),
        bv = keyFn(b);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [summary.runs, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };
  const sortIcon = (key) => (key !== sortKey ? '·' : sortDir === 'asc' ? '↑' : '↓');

  return (
    <div className="space-y-6">
      <div
        className="p-6 rounded-sm relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-purple, 31, 12, 41), 0.7) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
          border: '3px double rgba(168, 85, 247, 0.6)',
          boxShadow: '0 0 30px rgba(168, 85, 247, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
        }}
      >
        <div className="absolute top-2 left-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-purple-400 text-sm">⚜</div>

        <div className="flex items-center gap-3 mb-3">
          <Scroll
            className="w-10 h-10 text-purple-300"
            style={{ filter: 'drop-shadow(0 0 10px rgba(168, 85, 247, 0.6))' }}
          />
          <div>
            <h2
              className="text-2xl font-bold text-purple-200 italic"
              style={{ textShadow: '0 0 12px rgba(168, 85, 247, 0.4)' }}
            >
              The Chronicle of Delves
            </h2>
            <div className="text-xs text-purple-400 tracking-[0.2em] italic">⚜ {tomeTitle} ⚜</div>
          </div>
        </div>

        {summary.totalRuns === 0 ? (
          <p className="text-amber-100/60 italic text-sm">
            No delves recorded for this tome yet. Brave the dungeon to inscribe thy first chapter.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
            <RecordTile
              label="Total Delves"
              value={`${summary.totalRuns}`}
              sub={`${summary.totalWins}W · ${summary.totalRuns - summary.totalWins}L`}
            />
            <RecordTile
              label="Win Rate"
              value={`${Math.round(summary.winRate * 100)}%`}
              sub={summary.totalRuns < 5 ? `(${summary.totalRuns}/5 for stable rate)` : null}
            />
            <RecordTile
              label="Highest Score"
              value={summary.highestScore ? summary.highestScore.score.toLocaleString() : '—'}
              sub={summary.highestScore ? DIFFICULTIES[summary.highestScore.difficulty]?.label : null}
            />
            <RecordTile
              label="Fastest Win"
              value={summary.fastestWin ? formatDuration(summary.fastestWin.durationSec) : '—'}
              sub={summary.fastestWin ? DIFFICULTIES[summary.fastestWin.difficulty]?.label : null}
            />
            <RecordTile
              label="Longest Streak"
              value={summary.longestStreak ? `${summary.longestStreak.maxStreak}` : '—'}
              sub={summary.longestStreak ? DIFFICULTIES[summary.longestStreak.difficulty]?.label : null}
            />
          </div>
        )}
      </div>

      {summary.totalRuns === 0 ? (
        <div className="text-center py-12">
          <button
            onClick={() => setScreen('dungeon')}
            className="px-5 py-3 rounded-sm font-bold italic border-2 border-red-400 text-amber-50 inline-flex items-center gap-2"
            style={{
              background: 'linear-gradient(to bottom, #dc2626 0%, #991b1b 100%)',
              boxShadow: '0 0 18px rgba(220, 38, 38, 0.4)',
            }}
          >
            <Swords className="w-4 h-4" /> Begin a Delve
          </button>
        </div>
      ) : (
        <>
          {/* Polish: domain accuracy heatmap. Empty until tomes generated with
            per-question domain tags actually run; older runs fall under
            "Uncategorized". Always shows so the player can see when a new
            tome's analytics start landing. */}
          {totalAnswered > 0 && (
            <div
              className="p-4 rounded-sm"
              style={{
                background:
                  'linear-gradient(135deg, rgba(var(--surface-purple, 31, 12, 41), 0.6) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
                border: '2px solid rgba(126, 34, 206, 0.45)',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🎯</span>
                <h3 className="text-sm font-bold italic text-purple-200 tracking-wider">Accuracy by Domain</h3>
                <div className="flex-1 h-px bg-linear-to-r from-purple-700/40 to-transparent" />
                <span className="text-[10px] italic text-amber-700">
                  {totalAnswered} answered · {domainStats.length} domain{domainStats.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                {domainStats.map((b) => {
                  const pct = Math.round(b.accuracy * 100);
                  // Color ramp: red <50, amber 50-74, emerald 75-89, gold 90+
                  const ramp =
                    pct >= 90
                      ? { bg: 'rgba(245, 158, 11, 0.35)', border: '#fbbf24', text: '#fde047' }
                      : pct >= 75
                        ? { bg: 'rgba(16, 185, 129, 0.32)', border: '#10b981', text: '#a7f3d0' }
                        : pct >= 50
                          ? { bg: 'rgba(245, 158, 11, 0.22)', border: 'rgba(245, 158, 11, 0.6)', text: '#fde68a' }
                          : { bg: 'rgba(239, 68, 68, 0.25)', border: '#ef4444', text: '#fecaca' };
                  return (
                    <div
                      key={b.domain}
                      className="p-3 rounded-sm"
                      style={{
                        background: ramp.bg,
                        border: `1.5px solid ${ramp.border}`,
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="text-xs italic font-bold truncate" style={{ color: ramp.text }}>
                          {b.domain}
                        </div>
                        <div className="text-sm font-bold tabular-nums italic" style={{ color: ramp.text }}>
                          {pct}%
                        </div>
                      </div>
                      <div className="text-[10px] italic text-amber-100/70 mt-1">
                        {b.correct}/{b.total} correct
                      </div>
                      <div className="h-1.5 rounded-sm mt-2 overflow-hidden" style={{ background: 'rgba(0,0,0,0.45)' }}>
                        <div
                          className="h-full"
                          style={{
                            width: `${pct}%`,
                            background: ramp.border,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {domainStats.some((b) => b.domain === 'Uncategorized') && (
                <div className="text-[10px] italic text-amber-700/80 mt-3">
                  ✦ "Uncategorized" entries come from older tomes that lack per-question domain tags. New tomes will
                  populate the heatmap automatically.
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            {/* Polish: sortable column header bar. Each header is a button that
              toggles sort direction (or switches sortKey on a different
              column). Sort indicator is appended to the label. */}
            <div
              className="flex flex-wrap gap-2 items-center px-3 py-2 rounded-sm text-[11px] italic"
              style={{
                background: 'rgba(var(--surface-deep, 10, 6, 4), 0.45)',
                border: '1px solid rgba(var(--surface-amber-strong, 120, 53, 15), 0.3)',
              }}
            >
              <span className="text-amber-700 mr-1">Sort by:</span>
              {[
                { k: 'date', label: 'Date' },
                { k: 'difficulty', label: 'Difficulty' },
                { k: 'boss', label: 'Boss' },
                { k: 'score', label: 'Score' },
                { k: 'streak', label: 'Streak' },
                { k: 'duration', label: 'Duration' },
              ].map(({ k, label }) => {
                const active = sortKey === k;
                return (
                  <button
                    key={k}
                    onClick={() => toggleSort(k)}
                    className="px-2 py-1 rounded-sm transition"
                    style={{
                      background: active ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                      border: `1px solid ${active ? 'rgba(245, 158, 11, 0.6)' : 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.3)'}`,
                      color: active ? '#fde047' : '#a8a29e',
                    }}
                  >
                    {label} {sortIcon(k)}
                  </button>
                );
              })}
            </div>
            {sorted.map((run) => {
              const diff = DIFFICULTIES[run.difficulty] || DIFFICULTIES.apprentice;
              const boss = BOSS_TYPES[run.bossId];
              const isOpen = expanded === run.runId;
              const dateLabel = formatDateTimeLabel(run.date);
              return (
                <div
                  key={run.runId}
                  className="rounded-sm relative overflow-hidden"
                  style={{
                    background: run.won
                      ? 'linear-gradient(135deg, rgba(var(--surface-emerald, 6, 78, 59), 0.4) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)'
                      : 'linear-gradient(135deg, rgba(127, 29, 29, 0.4) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
                    border: run.won ? '2px solid rgba(16, 185, 129, 0.55)' : '2px solid rgba(239, 68, 68, 0.5)',
                  }}
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : run.runId)}
                    className="w-full p-4 text-left flex items-center gap-3 flex-wrap"
                  >
                    <span className="text-2xl shrink-0">{boss?.icon || '⚔'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-bold italic ${run.won ? 'text-emerald-200' : 'text-red-200'}`}>
                          {run.won ? '⚔ Victory' : '✗ Defeat'}
                        </span>
                        <span className="text-xs text-amber-200 italic">
                          {diff.icon} {diff.label}
                        </span>
                        {boss && <span className="text-xs text-purple-300 italic">vs {boss.name}</span>}
                        {run.modifiers?.length > 0 && (
                          <span className="text-xs text-amber-700 italic">
                            ⚜ {run.modifiers.length} curse{run.modifiers.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-amber-700 italic mt-0.5">{dateLabel}</div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span className="text-amber-300">
                        <Gem className="w-3 h-3 inline" /> {run.score?.toLocaleString() || 0}
                      </span>
                      <span className="text-orange-300">
                        <Flame className="w-3 h-3 inline" /> {run.maxStreak || 0}
                      </span>
                      <span className="text-red-300">
                        ❤ {run.livesRemaining}/{run.maxLives}
                      </span>
                      <span className="text-purple-300">⏱ {formatDuration(run.durationSec)}</span>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-amber-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-amber-400" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-amber-900/40 pt-3 space-y-2">
                      <div className="text-xs text-purple-300 italic">
                        Mistakes this run: <span className="text-amber-200 font-bold">{run.mistakes}</span> · Total
                        questions: <span className="text-amber-200 font-bold">{run.totalQuestions}</span>
                      </div>
                      {(() => {
                        // Aggregate Bloom's-level distribution + average difficulty across
                        // this run's questionLog. Rendered only when at least one entry
                        // carries the new fields (post-prompt-overhaul tomes); legacy
                        // runs simply skip this row.
                        const log = run.questionLog || [];
                        const bloomCounts = {};
                        let diffSum = 0,
                          diffN = 0;
                        log.forEach((q) => {
                          if (q.bloomLevel) bloomCounts[q.bloomLevel] = (bloomCounts[q.bloomLevel] || 0) + 1;
                          if (typeof q.difficulty === 'number') {
                            diffSum += q.difficulty;
                            diffN += 1;
                          }
                        });
                        const avgDiff = diffN > 0 ? diffSum / diffN : null;
                        const bloomEntries = Object.entries(bloomCounts).sort((a, b) => b[1] - a[1]);
                        if (avgDiff === null && bloomEntries.length === 0) return null;
                        return (
                          <div className="text-[11px] italic flex items-center gap-3 flex-wrap">
                            {avgDiff !== null && (
                              <span className="flex items-center gap-1.5">
                                <span className="text-amber-700">Avg difficulty:</span>
                                <DifficultyStars value={avgDiff} />
                                <span className="text-amber-200 tabular-nums">({avgDiff.toFixed(1)})</span>
                              </span>
                            )}
                            {bloomEntries.length > 0 && (
                              <span className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-amber-700">Bloom's mix:</span>
                                {bloomEntries.map(([level, count]) => (
                                  <span key={level} className="flex items-center gap-1">
                                    <BloomBadge level={level} />
                                    <span className="text-amber-200">×{count}</span>
                                  </span>
                                ))}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      {(run.questionLog || []).length === 0 ? (
                        <div className="text-xs text-amber-700 italic">
                          No per-question log was captured for this delve.
                        </div>
                      ) : (
                        (() => {
                          // 25e: source-aware badges so mob vs boss questions are
                          // visually distinct in the chronicle. Older entries
                          // (pre-25e) lack `source` and render without a badge.
                          const log = run.questionLog;
                          const mobCount = log.filter((q) => q.source === 'mob').length;
                          const bossCount = log.filter((q) => q.source === 'boss').length;
                          const renderBadge = (q) => {
                            if (q.source === 'boss') {
                              const name = BOSS_TYPES[q.bossKind]?.name || q.bossKind || 'Boss';
                              return <span className="text-amber-300">👑 {name}</span>;
                            }
                            if (q.source === 'mob') {
                              if (q.mobTier === 'elite') return <span className="text-purple-300">⚔ Elite</span>;
                              return <span className="text-slate-300">🗡 Foe</span>;
                            }
                            return null;
                          };
                          return (
                            <>
                              {(mobCount > 0 || bossCount > 0) && (
                                <div className="text-[10px] uppercase tracking-wider text-amber-700 italic">
                                  {mobCount > 0 ? (
                                    <span>
                                      🗡 {mobCount} foe{mobCount === 1 ? '' : 's'}
                                    </span>
                                  ) : null}
                                  {mobCount > 0 && bossCount > 0 ? <span> · </span> : null}
                                  {bossCount > 0 ? <span>👑 {bossCount} boss</span> : null}
                                </div>
                              )}
                              <div className="space-y-1">
                                {log.map((q, i) => (
                                  <div
                                    key={i}
                                    className="flex items-start gap-2 text-xs italic"
                                    style={{
                                      background: 'rgba(var(--surface-deep, 10, 6, 4), 0.5)',
                                      padding: '6px 8px',
                                      borderRadius: '4px',
                                    }}
                                  >
                                    {q.correct ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                    ) : (
                                      <X className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="text-amber-100/80 truncate">{q.prompt}</div>
                                      <div className="text-amber-700 flex flex-wrap gap-x-1.5 gap-y-1 items-center">
                                        {renderBadge(q)}
                                        {q.type ? <span>· type: {q.type}</span> : null}
                                        {typeof q.difficulty === 'number' ? (
                                          <span className="flex items-center gap-1">
                                            · <DifficultyStars value={q.difficulty} />
                                          </span>
                                        ) : null}
                                        {q.bloomLevel ? <BloomBadge level={q.bloomLevel} /> : null}
                                        {q.timeSec ? <span>· {q.timeSec}s</span> : null}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          );
                        })()
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default RunHistoryScreen;
