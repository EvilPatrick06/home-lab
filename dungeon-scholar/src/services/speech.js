// Speech-to-text dictation (sugg-speech-input).
//
// The app ships read-aloud TTS but no speech-to-text input. This lets a learner
// dictate free-text answers (graded by oracleGrader) or Oracle-chat messages via
// the Web Speech API, rounding out hands-free / accessibility study and pairing
// with the existing TTS output. Feature-detected + falls back silently where
// unsupported (Safari/Firefox coverage is partial) - same progressive-
// enhancement posture as Web Share Target / App Badging.

export function speechRecognitionSupported() {
  if (typeof window === 'undefined') return false;
  const w = /** @type {any} */ (window);
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

function getRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  const w = /** @type {any} */ (window);
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * Start a one-shot dictation. Calls onResult(transcript) with the recognized
 * text, onError(err) on failure, and onEnd() when the session ends. Returns a
 * handle with stop()/abort(), or null when unsupported (caller hides the mic).
 * @param {{ lang?: string, interim?: boolean, onResult?: Function, onError?: Function, onEnd?: Function }} [opts]
 */
export function startDictation({ lang = 'en-US', interim = false, onResult, onError, onEnd } = {}) {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    onError?.(new Error('SpeechRecognition unsupported'));
    return null;
  }
  let rec;
  try {
    rec = new Ctor();
  } catch (e) {
    onError?.(e);
    return null;
  }
  rec.lang = lang;
  rec.interimResults = !!interim;
  rec.maxAlternatives = 1;
  rec.continuous = false;

  rec.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0]?.transcript || '';
    }
    const isFinal = event.results[event.results.length - 1]?.isFinal;
    onResult?.(transcript.trim(), { isFinal: !!isFinal });
  };
  rec.onerror = (event) => onError?.(event?.error || new Error('speech error'));
  rec.onend = () => onEnd?.();

  try {
    rec.start();
  } catch (e) {
    onError?.(e);
    return null;
  }

  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    },
    abort: () => {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    },
  };
}
