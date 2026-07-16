import { Eye, Languages, Settings } from 'lucide-react';
import { OrnatePanel } from '../../components/ui/OrnatePanel.jsx';
import { availableLocales } from '../../services/i18n.js';

// Display names for the locales the i18n foundation ships. Locales without an
// entry fall back to their raw code, so adding a catalog never breaks the UI.
const LOCALE_LABELS = { en: 'English', es: 'Español' };
const localeLabel = (loc) => LOCALE_LABELS[loc] || loc;

// Phase 34b QA P10: theme picker — Dark (default) / Light / Match System.
// Persisted in playerState.theme; applied via data-theme on the root element
// by an effect in DungeonScholarApp. PHASE-41 (QA16): the light theme is now a
// FULL theme — inverted Tailwind ramps + flipped surface tokens restyle every
// screen, panel, and text run (see index.css). CSS in index.css.
//
// Also hosts two accessibility settings:
//  - Language picker (S7 i18n): bound to availableLocales()/setLocale via
//    onSetLocale, persisted in playerState.locale like the theme choice.
//  - Colorblind-safe palette (CVD): persisted in playerState.colorblind and
//    applied via data-cvd on the root. Re-colors the per-domain accuracy bars
//    / analytics to a CVD-safe (blue↔orange) scale instead of red↔green.
function ThemePanel({
  currentTheme,
  onSetTheme,
  currentLocale = 'en',
  onSetLocale,
  colorblind = false,
  onToggleColorblind,
  textScale = 100,
  onSetTextScale,
  dyslexiaFont = false,
  onToggleDyslexiaFont,
  desiredRetention = 0.9,
  onSetRetention,
  newCardCap = 20,
  onSetNewCardCap,
  dailyGoal = 20,
  onSetDailyGoal,
  streakFreezeTokens = 0,
}) {
  const retentionPct = Math.round((Number(desiredRetention) || 0.9) * 100);
  const opts = [
    { id: 'dark', label: '🌙 Dark', desc: 'The default dungeon palette.' },
    { id: 'light', label: '☀ Light', desc: 'Parchment-light pages, panels, and text. Full light theme.' },
    { id: 'system', label: '🖥 Match System', desc: 'Follows your OS color preference.' },
  ];
  const locales = availableLocales();
  return (
    <OrnatePanel color="amber">
      <h3 className="text-lg font-bold mb-3 text-amber-300 flex items-center gap-2 italic">
        <Settings className="w-5 h-5" /> ✦ Visual Theme ✦
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {opts.map((o) => {
          const active = currentTheme === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onSetTheme?.(o.id)}
              aria-pressed={active}
              className={`text-left p-3 rounded-sm border-2 italic transition ${active ? 'border-amber-300 text-amber-100' : 'border-amber-700 text-amber-200 hover:border-amber-500'}`}
              style={{
                background: active
                  ? 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.5)'
                  : 'rgba(var(--surface-amber, 41, 24, 12), 0.7)',
                boxShadow: active ? '0 0 12px rgba(245, 158, 11, 0.4)' : 'none',
              }}
            >
              <div className="text-sm font-bold">{o.label}</div>
              <div className="text-[10px] italic text-amber-200/70 mt-1">{o.desc}</div>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] italic text-amber-700/80 mt-3">
        ⓘ Both themes restyle every screen; pick whichever reads best.
      </p>

      {/* Colorblind-safe analytics palette toggle. Hue is never the SOLE signal
          (the bars also carry a % and a tier word), but red↔green is the
          worst-case axis for deuteranopia/protanopia, so this swaps the
          accuracy scale to a CVD-safe blue↔orange ramp. */}
      <div className="mt-4 pt-3 border-t border-amber-900/40">
        <button
          onClick={() => onToggleColorblind?.(!colorblind)}
          aria-pressed={colorblind}
          className={`w-full text-left p-3 rounded-sm border-2 italic transition flex items-center gap-2 ${colorblind ? 'border-amber-300 text-amber-100' : 'border-amber-700 text-amber-200 hover:border-amber-500'}`}
          style={{
            background: colorblind
              ? 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.5)'
              : 'rgba(var(--surface-amber, 41, 24, 12), 0.7)',
            boxShadow: colorblind ? '0 0 12px rgba(245, 158, 11, 0.4)' : 'none',
          }}
        >
          <Eye className="w-4 h-4 shrink-0" />
          <span>
            <span className="text-sm font-bold">Colorblind-safe palette {colorblind ? '— On' : '— Off'}</span>
            <span className="block text-[10px] italic text-amber-200/70 mt-0.5">
              Re-colors the domain accuracy bars / analytics to a CVD-safe scale (and pairs each with a tier label).
            </span>
          </span>
        </button>
      </div>

      {/* S7 i18n language picker. Only the app chrome is migrated so far; tome
          content always stays in its author's language. */}
      <div className="mt-4 pt-3 border-t border-amber-900/40">
        <label
          htmlFor="ds-locale-select"
          className="text-xs font-bold text-amber-300 flex items-center gap-2 italic mb-2"
        >
          <Languages className="w-4 h-4" /> Language
        </label>
        <select
          id="ds-locale-select"
          value={currentLocale}
          onChange={(e) => onSetLocale?.(e.target.value)}
          className="w-full p-2 rounded-sm text-amber-50 italic border-2 border-amber-700"
          style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
        >
          {locales.map((loc) => (
            <option key={loc} value={loc}>
              {localeLabel(loc)}
            </option>
          ))}
        </select>
        <p className="text-[10px] italic text-amber-700/80 mt-2">
          ⓘ Translations cover app menus only; tome content stays as written.
        </p>
      </div>

      {/* Reading comfort: font scale + optional dyslexia-friendly font. Applied
          via the root --text-scale custom property + a data-dyslexia flag. */}
      <div className="mt-4 pt-3 border-t border-amber-900/40">
        <label htmlFor="ds-text-scale" className="text-xs font-bold text-amber-300 flex items-center gap-2 italic mb-2">
          Text size — {textScale}%
        </label>
        <input
          id="ds-text-scale"
          type="range"
          min={90}
          max={130}
          step={5}
          value={textScale}
          onChange={(e) => onSetTextScale?.(Number(e.target.value))}
          className="w-full accent-amber-400"
        />
        <button
          type="button"
          onClick={() => onToggleDyslexiaFont?.(!dyslexiaFont)}
          aria-pressed={dyslexiaFont}
          className={`mt-3 w-full text-left p-3 rounded-sm border-2 italic transition ${dyslexiaFont ? 'border-amber-300 text-amber-100' : 'border-amber-700 text-amber-200 hover:border-amber-500'}`}
          style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
        >
          <span className="text-sm font-bold">Reading-comfort font {dyslexiaFont ? '— On' : '— Off'}</span>
          <span className="block text-[10px] italic text-amber-200/70 mt-0.5">
            Adds extra letter/word spacing and a sans-serif face for easier reading.
          </span>
        </button>
        <p className="text-[10px] italic text-amber-700/80 mt-2">ⓘ Affects study text across the app.</p>
      </div>

      {/* SRS study-load knobs: desired retention + daily new-card cap. */}
      <div className="mt-4 pt-3 border-t border-amber-900/40">
        <h4 className="text-xs font-bold text-amber-300 italic mb-2">Study load (spaced repetition)</h4>
        <label htmlFor="ds-retention" className="text-[11px] italic text-amber-200 block mb-1">
          Desired retention — {retentionPct}%
        </label>
        <input
          id="ds-retention"
          type="range"
          min={80}
          max={97}
          step={1}
          value={retentionPct}
          onChange={(e) => onSetRetention?.(Number(e.target.value) / 100)}
          className="w-full accent-amber-400"
        />
        <p className="text-[10px] italic text-amber-700/80 mt-1 mb-3">
          ⓘ Higher = more reviews, stronger recall (good near an exam). Lower = fewer reviews.
        </p>
        <label htmlFor="ds-newcap" className="text-[11px] italic text-amber-200 block mb-1">
          New cards per review session
        </label>
        <input
          id="ds-newcap"
          type="number"
          min={0}
          max={999}
          value={newCardCap}
          onChange={(e) => onSetNewCardCap?.(Number(e.target.value))}
          className="w-24 p-2 rounded-sm text-amber-50 italic border-2 border-amber-700"
          style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
        />
        <p className="text-[10px] italic text-amber-700/80 mt-1">
          ⓘ Caps how many never-seen cards enter a session so a large import doesn't flood you (default 20).
        </p>
      </div>

      {/* sugg-daily-goal: configurable daily study target + streak-freeze count. */}
      <div className="mt-4 pt-3 border-t border-amber-900/40">
        <h4 className="text-xs font-bold text-amber-300 italic mb-2">Daily goal</h4>
        <label htmlFor="ds-daily-goal" className="text-[11px] italic text-amber-200 block mb-1">
          Items to study per day
        </label>
        <input
          id="ds-daily-goal"
          type="number"
          min={1}
          max={500}
          value={dailyGoal}
          onChange={(e) => onSetDailyGoal?.(Number(e.target.value))}
          className="w-24 p-2 rounded-sm text-amber-50 italic border-2 border-amber-700"
          style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
        />
        <p className="text-[10px] italic text-amber-700/80 mt-1">
          ⓘ Any answered riddle or reviewed scroll counts toward today's goal — meet it to earn a streak-freeze ward (up
          to 3). ❄ Wards held: {streakFreezeTokens} (each forgives one missed devotion day).
        </p>
      </div>
    </OrnatePanel>
  );
}

export default ThemePanel;
