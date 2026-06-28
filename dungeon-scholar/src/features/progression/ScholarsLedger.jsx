import { AlertTriangle, ArrowLeft, Award } from 'lucide-react';
import { useState } from 'react';
import { OrnatePanel } from '../../components/ui/OrnatePanel.jsx';
import { RecordTile } from '../../components/ui/RecordTile.jsx';
import { getTitle } from '../../game/titles.js';
import { barColor, tierLabel } from '../../services/accuracyPalette.js';
import { isTomeMastered, tomeMasteryPct } from '../../services/certificate.js';
import { LEECH_LAPSE_THRESHOLD, listLeeches } from '../../services/leech.js';
import { isSealedTome } from '../../services/sealedTome.js';
import { dueCount } from '../../services/srs.js';
import CertificateModal from './CertificateModal.jsx';

// S2: Scholar's Ledger — a learner-facing analytics view aggregating the
// study signals that were previously scattered across the RPG screens.
function ScholarsLedger({ playerState, setScreen, scholarName, onSuspendCard, onEditTome }) {
  const lib = playerState.library || [];
  const unsealed = (t) => !isSealedTome(t.data);
  const cardsReviewed = lib.reduce((s, t) => s + (t.progress?.cardsReviewed || 0), 0);
  const due = lib.reduce(
    (s, t) => s + (unsealed(t) ? dueCount(t.progress?.cardProgress || {}, t.data?.flashcards || []) : 0),
    0,
  );
  const inRotation = lib.reduce((s, t) => s + Object.keys(t.progress?.cardProgress || {}).length, 0);
  const totalAnswered = playerState.totalAnswered || 0;
  const totalCorrect = playerState.totalCorrect || 0;
  const accuracy = totalAnswered ? Math.round((100 * totalCorrect) / totalAnswered) : 0;
  const cvd = !!playerState.colorblind; // CVD: colorblind-safe accuracy palette
  const [certTome, setCertTome] = useState(null);
  const earnedTitle = getTitle(playerState.level || 1, playerState.selectedTitle, playerState.unlockedTitles);
  const diplomas = lib
    .filter((t) => unsealed(t) && isTomeMastered(t.progress, t.data))
    .map((t) => ({
      id: t.id,
      title: t.data?.metadata?.title || 'Untitled Tome',
      pct: tomeMasteryPct(t.progress, t.data),
    }));

  const domains = {};
  for (const t of lib) {
    for (const [d, st] of Object.entries(t.progress?.domainStats || {})) {
      domains[d] = domains[d] || { total: 0, correct: 0 };
      domains[d].total += st.total || 0;
      domains[d].correct += st.correct || 0;
    }
  }
  const domainRows = Object.entries(domains)
    .map(([domain, st]) => ({
      domain,
      total: st.total,
      correct: st.correct,
      acc: st.total ? Math.round((100 * st.correct) / st.total) : 0,
    }))
    .sort((a, b) => a.acc - b.acc);
  const weakest = domainRows.find((r) => r.total >= 5) || domainRows[0] || null;
  const leeches = [];
  for (const t of lib) {
    if (!unsealed(t)) continue;
    for (const l of listLeeches(t.progress?.cardProgress || {}, t.data?.flashcards || [])) {
      leeches.push({ ...l, tomeId: t.id, tomeTitle: t.data?.metadata?.title || 'Untitled Tome' });
    }
  }
  leeches.sort((a, b) => b.lapses - a.lapses);
  const activeLeeches = leeches.filter((l) => !l.suspended).length;
  const hardest = [];
  for (const t of lib) {
    if (!unsealed(t)) continue;
    const qs = t.progress?.questionStats || {};
    const data = t.data || {};
    const labelFor = (id) => {
      const fc = (data.flashcards || []).find((c) => c && c.id === id);
      if (fc) return fc.front || fc.back || id;
      const q = (data.quiz || []).find((c) => c && c.id === id);
      if (q) return q.question || id;
      return id;
    };
    for (const [id, st] of Object.entries(qs)) {
      const attempts = st?.attempts || 0;
      if (attempts < 2) continue;
      const correct = st?.correct || 0;
      hardest.push({
        key: `${t.id}:${id}`,
        tomeId: t.id,
        tomeTitle: data.metadata?.title || 'Untitled Tome',
        label: labelFor(id),
        attempts,
        correct,
        acc: attempts ? Math.round((100 * correct) / attempts) : 0,
        highConfWrong: st?.highConfWrong || 0,
      });
    }
  }
  hardest.sort((a, b) => a.acc - b.acc || b.attempts - a.attempts);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2
          className="text-2xl font-bold text-amber-200 italic"
          style={{ textShadow: '0 0 12px rgba(245, 158, 11, 0.4)' }}
        >
          ✦ Scholar's Ledger ✦
        </h2>
        <button
          onClick={() => setScreen('home')}
          className="px-3 py-2 rounded-sm text-sm border-2 border-amber-700 text-amber-200 flex items-center gap-1 italic hover:bg-amber-900/30"
        >
          <ArrowLeft className="w-4 h-4" /> Back to the Hearth
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <RecordTile label="Level" value={playerState.level || 1} sub={`${playerState.totalXp || 0} total XP`} />
        <RecordTile label="Accuracy" value={`${accuracy}%`} sub={`${totalCorrect}/${totalAnswered} answered`} />
        <RecordTile label="Scrolls reviewed" value={cardsReviewed} />
        <RecordTile label="Due now" value={due} sub="across all tomes" />
        <RecordTile label="In review rotation" value={inRotation} sub="cards scheduled" />
        <RecordTile label="Tomes" value={lib.length} />
        <RecordTile label="Leeches" value={activeLeeches} sub="cards keep slipping" />
      </div>

      {weakest && (
        <OrnatePanel color="rose">
          <div className="text-xs text-rose-300 uppercase tracking-[0.15em] italic mb-1">Weakest domain</div>
          <div className="text-lg font-bold text-rose-200 italic">
            {weakest.domain} — {weakest.acc}%{' '}
            <span className="text-sm text-rose-200/70">
              ({weakest.correct}/{weakest.total})
            </span>
          </div>
          <div className="text-xs text-amber-100/70 italic mt-1">
            Drill this domain in Quiz or the dungeon to shore it up.
          </div>
        </OrnatePanel>
      )}

      <OrnatePanel color="sapphire">
        <h3 className="text-base font-bold text-sky-200 italic mb-3">Per-domain mastery</h3>
        {domainRows.length === 0 ? (
          <div className="text-sm text-amber-100/60 italic">
            No domain data yet — answer some quiz riddles or delve to populate this.
          </div>
        ) : (
          <div className="space-y-1">
            {domainRows.map((r) => (
              <div key={r.domain} className="flex items-center gap-2 text-sm">
                <div className="flex-1 italic text-amber-100 truncate">{r.domain}</div>
                <div className="w-40 h-2 rounded bg-black/40 overflow-hidden">
                  <div style={{ width: `${r.acc}%`, height: '100%', background: barColor(r.acc, cvd) }} />
                </div>
                <div className="w-28 text-right tabular-nums text-amber-200 italic">
                  {r.acc}% · {tierLabel(r.acc)} <span className="text-amber-200/60">({r.total})</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </OrnatePanel>

      <OrnatePanel color="sapphire">
        <h3 className="text-base font-bold text-sky-200 italic mb-1">Hardest questions</h3>
        <div className="text-xs text-amber-100/60 italic mb-3">
          Your lowest-accuracy items (answered at least twice). A ⚠ marks dangerous overconfidence — answered with high
          confidence but still wrong.
        </div>
        {hardest.length === 0 ? (
          <div className="text-sm text-amber-100/60 italic">
            Answer some questions more than once to surface which ones trip you up.
          </div>
        ) : (
          <div className="space-y-1">
            {hardest.slice(0, 10).map((h) => (
              <div key={h.key} className="flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="italic text-amber-100 truncate">{h.label}</div>
                  <div className="text-xs text-amber-200/50 italic truncate">{h.tomeTitle}</div>
                </div>
                {h.highConfWrong > 0 && (
                  <span
                    className="text-xs text-rose-300 italic whitespace-nowrap"
                    title={`${h.highConfWrong} high-confidence wrong answer(s)`}
                  >
                    ⚠ overconfident
                  </span>
                )}
                <div className="w-24 text-right tabular-nums text-amber-200 italic whitespace-nowrap">
                  {h.acc}%{' '}
                  <span className="text-amber-200/60">
                    ({h.correct}/{h.attempts})
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </OrnatePanel>

      <OrnatePanel color="rose">
        <h3 className="text-base font-bold text-rose-200 italic mb-1 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Leeches
        </h3>
        <div className="text-xs text-amber-100/60 italic mb-3">
          Cards you keep forgetting (≥ {LEECH_LAPSE_THRESHOLD} lapses). Rewrite them, add a hint, or suspend them from
          review so they stop crowding the due queue.
        </div>
        {leeches.length === 0 ? (
          <div className="text-sm text-amber-100/60 italic">
            No leeches — nothing is chronically slipping away. Keep it up.
          </div>
        ) : (
          <div className="space-y-1">
            {leeches.slice(0, 12).map((l) => (
              <div key={`${l.tomeId}:${l.id}`} className="flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className={`italic truncate ${l.suspended ? 'text-stone-300 line-through' : 'text-amber-100'}`}>
                    {l.front || l.id}
                  </div>
                  <div className="text-xs text-amber-200/50 italic truncate">
                    {l.tomeTitle}
                    {l.domain ? ` · ${l.domain}` : ''}
                  </div>
                </div>
                <div className="text-xs tabular-nums text-rose-300 italic whitespace-nowrap">{l.lapses}× lapsed</div>
                {onSuspendCard && (
                  <button
                    type="button"
                    onClick={() => onSuspendCard(l.tomeId, l.id, !l.suspended)}
                    className="px-2 py-1 rounded-sm border border-stone-600 text-stone-300 italic text-xs hover:bg-stone-800/40"
                  >
                    {l.suspended ? 'Resume' : 'Suspend'}
                  </button>
                )}
                {onEditTome && (
                  <button
                    type="button"
                    onClick={() => onEditTome(l.tomeId)}
                    className="px-2 py-1 rounded-sm border border-amber-700 text-amber-200 italic text-xs hover:bg-amber-900/30"
                  >
                    Edit
                  </button>
                )}
              </div>
            ))}
            {leeches.length > 12 && (
              <div className="text-xs text-amber-100/50 italic pt-1">+{leeches.length - 12} more…</div>
            )}
          </div>
        )}
      </OrnatePanel>

      <OrnatePanel color="amber">
        <h3 className="text-base font-bold text-amber-200 italic mb-3 flex items-center gap-2">
          <Award className="w-4 h-4" /> Diplomas
        </h3>
        {diplomas.length === 0 ? (
          <div className="text-sm text-amber-100/60 italic">
            Master a tome (most cards reviewed and in long-term rotation) to earn a downloadable certificate.
          </div>
        ) : (
          <div className="space-y-1">
            {diplomas.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-sm">
                <div className="flex-1 italic text-amber-100 truncate">{d.title}</div>
                <div className="text-amber-200/70 tabular-nums">{d.pct}%</div>
                <button
                  onClick={() => setCertTome(d)}
                  className="px-3 py-1 rounded-sm border-2 border-amber-300 text-amber-950 font-bold italic text-xs flex items-center gap-1"
                  style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 50%, #b45309 100%)' }}
                >
                  <Award className="w-3 h-3" /> Certificate
                </button>
              </div>
            ))}
          </div>
        )}
      </OrnatePanel>

      {certTome && (
        <CertificateModal
          scholarName={scholarName}
          tomeTitle={certTome.title}
          title={earnedTitle}
          masteryPct={certTome.pct}
          onClose={() => setCertTome(null)}
        />
      )}
    </div>
  );
}

export default ScholarsLedger;
