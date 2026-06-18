import { useState } from 'react';
import { RotateCcw, Settings } from 'lucide-react';
import { OrnatePanel } from '../../components/ui/OrnatePanel.jsx';
import { getAudioSettings, setMuted, setBgmVolume, setSfxVolume, playSfx, getDefaultAudioSettings } from '../../audio/sound.js';

// Phase 21: lightweight audio settings panel. Default state is muted so
// the page is silent on first load; the player opts in here. Volume
// changes apply live via the audio module's gain nodes.
function AudioPanel() {
  const [muted, setLocalMuted] = useState(getAudioSettings().muted);
  const [bgm, setLocalBgm] = useState(getAudioSettings().bgmVolume);
  const [sfx, setLocalSfx] = useState(getAudioSettings().sfxVolume);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setLocalMuted(next);
    if (!next) playSfx('click');
  };
  const onBgm = (v) => { setBgmVolume(v); setLocalBgm(v); };
  const onSfx = (v) => { setSfxVolume(v); setLocalSfx(v); if (!muted) playSfx('click'); };
  // Phase 46g: one-click recovery for "I slid these to 0 and now I can't
  // hear anything". Restores both volumes; mute is left alone (default
  // mute would silence the user a second time, which is the opposite of
  // what they want when reaching for Reset).
  const defaults = getDefaultAudioSettings();
  const onReset = () => {
    setBgmVolume(defaults.bgmVolume);
    setSfxVolume(defaults.sfxVolume);
    setLocalBgm(defaults.bgmVolume);
    setLocalSfx(defaults.sfxVolume);
    if (!muted) playSfx('click');
  };
  const atDefaults = bgm === defaults.bgmVolume && sfx === defaults.sfxVolume;

  return (
    <OrnatePanel color="sapphire">
      <h3 className="text-lg font-bold mb-3 text-sky-300 flex items-center gap-2 italic">
        <Settings className="w-5 h-5" /> ✦ Bardic Settings ✦
      </h3>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={toggleMute}
            className={`px-4 py-2 rounded-sm flex items-center gap-2 italic border-2 ${muted ? 'border-stone-600 text-stone-300' : 'border-emerald-600 text-emerald-200'}`}
            style={{ background: muted ? 'rgba(31, 24, 12, 0.7)' : 'rgba(6, 78, 59, 0.4)' }}>
            {muted ? '🔇 Sound: Off' : '🔊 Sound: On'}
          </button>
          <span className="text-xs italic text-amber-700">
            Procedural audio — generated on the fly. No files, no downloads.
          </span>
        </div>
        <div className={muted ? 'opacity-50 pointer-events-none' : ''}>
          <label className="flex items-center gap-3 mb-2">
            <span className="w-24 text-amber-700 italic text-xs">🎼 Music</span>
            <input type="range" min={0} max={1} step={0.05} value={bgm}
              onChange={(e) => onBgm(parseFloat(e.target.value))}
              className="flex-1" />
            <span className="w-10 text-right tabular-nums text-amber-300 text-xs">{Math.round(bgm * 100)}%</span>
          </label>
          <label className="flex items-center gap-3">
            <span className="w-24 text-amber-700 italic text-xs">⚔ Effects</span>
            <input type="range" min={0} max={1} step={0.05} value={sfx}
              onChange={(e) => onSfx(parseFloat(e.target.value))}
              className="flex-1" />
            <span className="w-10 text-right tabular-nums text-amber-300 text-xs">{Math.round(sfx * 100)}%</span>
          </label>
        </div>
        <div className="flex items-center justify-end">
          <button
            onClick={onReset}
            disabled={atDefaults}
            title={`Reset Music to ${Math.round(defaults.bgmVolume * 100)}% and Effects to ${Math.round(defaults.sfxVolume * 100)}%`}
            className="px-3 py-1.5 rounded-sm text-xs italic border-2 border-amber-700 text-amber-200 hover:bg-amber-900/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            style={{ background: 'rgba(41, 24, 12, 0.7)' }}
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Reset to defaults
          </button>
        </div>
      </div>
    </OrnatePanel>
  );
}

export default AudioPanel;
