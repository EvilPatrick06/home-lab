// S14: lightweight text-to-speech via the Web Speech API (speechSynthesis).
// Offline, no dependency. Strips code/Mermaid fences + markdown punctuation so
// they aren't read aloud verbatim.
export const ttsSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

export function stripForSpeech(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/```[\s\S]*?```/g, ' (code block) ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>~$]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speak(text, { rate = 1 } = {}) {
  if (!ttsSupported()) return false;
  const clean = stripForSpeech(text);
  if (!clean) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(clean);
    u.rate = rate;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking() {
  if (ttsSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* noop */
    }
  }
}
