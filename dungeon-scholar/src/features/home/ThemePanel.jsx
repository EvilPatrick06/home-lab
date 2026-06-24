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
}) {
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
    </OrnatePanel>
  );
}

export default ThemePanel;
