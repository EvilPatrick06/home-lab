import { Check, Copy, Download, Loader2, Lock, Share2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { encodeTomeShareCode, stripLocalOnlyTomeFields } from '../../game/tome.js';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';
import { exportTomeCsv } from '../../services/deckImport.js';
import { openPrintableTome } from '../../services/printExport.js';
import { isSealedTome, sealTome } from '../../services/sealedTome.js';

// Phase 30i QA #19: tomes whose share code exceeds this threshold default to
// the "Download JSON" path. The raw code is still available behind a
// disclosure, but pasting a 250 KB string into chat apps + textareas misbehaves.
export const SHARE_LARGE_THRESHOLD = 50_000;

// Slugify a tome title the same way the plain export always has. Shared so the
// sealed export below produces a matching `<slug>-sealed.json` filename.
function tomeSlug(data) {
  return (data?.metadata?.title || 'tome').replace(/[^a-z0-9-_]+/gi, '_');
}

// Download a tome's `.data` as a JSON file. `suffix` lets the sealed-export path
// reuse the exact same slug + blob machinery while writing `<slug>-sealed.json`.
export function downloadTomeJson(tome, { suffix = '' } = {}) {
  try {
    const json = JSON.stringify(stripLocalOnlyTomeFields(tome.data), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tomeSlug(tome.data)}${suffix}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

// Download a tome's flashcards as a CSV / Quizlet-compatible two-column file —
// the machine-readable, re-importable inverse of the CSV importer. Reuses the
// same Blob/object-URL download machinery as downloadTomeJson.
export function downloadTomeCsv(tome) {
  try {
    const csv = exportTomeCsv(tome);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tomeSlug(tome.data)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

function ShareTomeModal({ tome, onClose }) {
  const panelRef = useDialogA11y({ onClose }); // 19A
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef(null);
  const code = useMemo(() => (tome ? encodeTomeShareCode(tome.data) : null), [tome]);
  const isLarge = (code?.length || 0) > SHARE_LARGE_THRESHOLD;
  const [showRawCode, setShowRawCode] = useState(false);

  // PHASE-41 41C: "seal for proctored use" export. Sealing is an export-only
  // operation — the library entry is never mutated; the proctor seals → ships
  // the sealed file/share code → students import the sealed copy.
  const alreadySealed = isSealedTome(tome?.data);
  const [sealPass, setSealPass] = useState('');
  const [sealConfirm, setSealConfirm] = useState('');
  const [sealBusy, setSealBusy] = useState(false);
  const [sealError, setSealError] = useState('');

  const handleSeal = async () => {
    if (sealBusy) return;
    if (sealPass.length < 8) {
      setSealError('Passphrase must be at least 8 characters.');
      return;
    }
    if (sealPass !== sealConfirm) {
      setSealError('Passphrases do not match.');
      return;
    }
    setSealBusy(true);
    setSealError('');
    try {
      const envelope = await sealTome(tome.data, sealPass);
      downloadTomeJson({ data: envelope }, { suffix: '-sealed' });
      setSealPass('');
      setSealConfirm('');
    } catch (err) {
      const reason = err?.message || 'seal-failed';
      setSealError(
        reason === 'weak-passphrase'
          ? 'Passphrase must be at least 8 characters.'
          : reason === 'empty-tome'
            ? 'This tome has no content to seal.'
            : `Unable to seal this tome (${reason}).`,
      );
    } finally {
      setSealBusy(false);
    }
  };

  const copy = () => {
    if (!code) return;
    let success = false;
    try {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.select();
        try {
          success = document.execCommand('copy');
        } catch {
          success = false;
        }
      }
    } catch {
      success = false;
    }
    if (!success && navigator.clipboard) {
      navigator.clipboard
        .writeText(code)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {});
      return;
    }
    setCopied(success);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!tome) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Share tome"
        className="rounded-sm max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-purple, 31, 12, 41), 0.97) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.99) 100%)',
          border: '3px double rgba(168, 85, 247, 0.6)',
          boxShadow: '0 0 40px rgba(168, 85, 247, 0.3)',
        }}
      >
        <div className="absolute top-2 left-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-purple-400 text-sm">⚜</div>

        <div className="p-4 border-b border-purple-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-purple-300 flex items-center gap-2 italic">
            <Share2 className="w-5 h-5" /> ✦ Share Thy Tome ✦
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-purple-900/30 rounded-sm text-purple-300"
            aria-label="Close share dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto overscroll-contain flex-1 flex flex-col gap-3">
          <p className="text-sm text-amber-100/85 italic">
            &ldquo;Share <span className="text-amber-300 font-bold">{tome.data.metadata.title}</span> with fellow
            scholars. They may import it via the Hash sigil (Share Code) or by loading the downloaded JSON file.&rdquo;
          </p>
          <div className="text-xs text-purple-400 italic">
            Code length: {code?.length || 0} characters ({Math.round((code?.length || 0) / 1024)} KB)
          </div>
          {isLarge ? (
            // Phase 30i QA #19: large tomes default to the file path. The raw
            // share code is still reachable behind a disclosure for users who
            // need it (e.g., pasting into a chat that strips attachments).
            <>
              <div
                className="p-3 rounded-sm text-sm italic"
                style={{
                  background: 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.35)',
                  border: '1px solid rgba(245, 158, 11, 0.5)',
                  color: '#fde68a',
                }}
              >
                ⚠ This tome is large ({Math.round((code?.length || 0) / 1024)} KB). Sharing as a JSON file is more
                reliable than pasting the raw code — many chat apps truncate or mangle long strings.
              </div>
              <button
                onClick={() => downloadTomeJson(tome)}
                className="py-3 font-bold rounded-sm flex items-center justify-center gap-2 text-amber-50 border-2 border-emerald-300 italic"
                style={{
                  background: 'linear-gradient(to bottom, #10b981 0%, #047857 100%)',
                  boxShadow: '0 0 20px rgba(16, 185, 129, 0.5)',
                }}
              >
                <Download className="w-4 h-4" /> Download Tome JSON
              </button>
              <button
                type="button"
                onClick={() => downloadTomeCsv(tome)}
                className="py-2 font-bold rounded-sm flex items-center justify-center gap-2 text-amber-100 border-2 border-emerald-700/70 italic text-sm"
                style={{ background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)' }}
              >
                <Download className="w-4 h-4" /> Download flashcards as CSV (Quizlet)
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openPrintableTome(tome, { withAnswers: true })}
                  className="flex-1 py-2 rounded-sm text-amber-100 border-2 border-amber-700/70 italic text-sm"
                  style={{ background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)' }}
                >
                  ⎙ Print / PDF (with answers)
                </button>
                <button
                  type="button"
                  onClick={() => openPrintableTome(tome, { withAnswers: false })}
                  className="flex-1 py-2 rounded-sm text-amber-100 border-2 border-amber-700/70 italic text-sm"
                  style={{ background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)' }}
                >
                  ⎙ Print / PDF (questions only)
                </button>
              </div>
              <details
                className="text-xs italic text-amber-700/85"
                onToggle={(e) => setShowRawCode(e.currentTarget.open)}
              >
                <summary className="cursor-pointer hover:text-amber-300">
                  {showRawCode ? '▾' : '▸'} Show raw share code anyway
                </summary>
                <div className="mt-2 space-y-2">
                  <textarea
                    ref={textareaRef}
                    value={code || ''}
                    readOnly
                    className="w-full min-h-[120px] p-3 rounded-sm border-2 focus:outline-hidden text-amber-50 font-mono text-xs"
                    style={{
                      background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)',
                      borderColor: 'rgba(126, 34, 206, 0.5)',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                    }}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    onClick={copy}
                    className="w-full py-2 rounded-sm flex items-center justify-center gap-2 text-amber-50 border-2 border-purple-300 italic text-sm"
                    style={{ background: 'linear-gradient(to bottom, #a855f7 0%, #6b21a8 100%)' }}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" /> Inscribed!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" /> Copy Share Code
                      </>
                    )}
                  </button>
                </div>
              </details>
            </>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                value={code || ''}
                readOnly
                className="flex-1 min-h-[200px] p-3 rounded-sm border-2 focus:outline-hidden text-amber-50 font-mono text-xs"
                style={{
                  background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)',
                  borderColor: 'rgba(126, 34, 206, 0.5)',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                }}
                onFocus={(e) => e.target.select()}
              />
              <p className="text-xs text-amber-700/85 italic">
                ⚠ The code contains the entire tome&apos;s contents. Or download as a JSON file if you prefer.
              </p>
              <button
                onClick={() => downloadTomeJson(tome)}
                className="text-xs italic text-emerald-300 hover:text-emerald-200 flex items-center gap-1 self-start"
              >
                <Download className="w-3 h-3" /> Download as JSON file instead
              </button>
              <button
                type="button"
                onClick={() => downloadTomeCsv(tome)}
                className="text-xs italic text-emerald-300 hover:text-emerald-200 flex items-center gap-1 self-start"
              >
                <Download className="w-3 h-3" /> Download flashcards as CSV (Quizlet)
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => openPrintableTome(tome, { withAnswers: true })}
                  className="text-xs italic text-amber-300 hover:text-amber-100 flex items-center gap-1"
                >
                  ⎙ Print / PDF (with answers)
                </button>
                <button
                  type="button"
                  onClick={() => openPrintableTome(tome, { withAnswers: false })}
                  className="text-xs italic text-amber-300 hover:text-amber-100 flex items-center gap-1"
                >
                  ⎙ questions only
                </button>
              </div>
            </>
          )}

          {/* PHASE-41 41C: seal-for-proctored-use export. */}
          <div className="mt-2 pt-3 border-t border-purple-700/50 flex flex-col gap-2">
            <h4 className="text-sm font-bold text-purple-200 flex items-center gap-2 italic">
              <Lock className="w-4 h-4" aria-hidden="true" /> Seal for proctored use
            </h4>
            {alreadySealed ? (
              <p className="text-xs italic text-amber-100/60">This tome is already sealed.</p>
            ) : (
              <>
                <p className="text-xs italic text-amber-100/70">
                  Encrypt this tome&rsquo;s content under a passphrase so its answers stay hidden in the file, share
                  code, and view-source. Students unseal it with the passphrase when they import it.
                </p>
                <label className="block w-full text-left">
                  <span className="text-xs text-amber-300 italic block mb-1">Proctor passphrase</span>
                  <input
                    type="password"
                    value={sealPass}
                    onChange={(e) => {
                      setSealPass(e.target.value);
                      setSealError('');
                    }}
                    autoComplete="off"
                    aria-label="Proctor passphrase"
                    disabled={sealBusy}
                    className="w-full p-2 rounded-sm border-2 focus:outline-hidden italic text-amber-50 disabled:opacity-50"
                    style={{
                      background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)',
                      borderColor: 'rgba(126, 34, 206, 0.6)',
                    }}
                  />
                </label>
                <label className="block w-full text-left">
                  <span className="text-xs text-amber-300 italic block mb-1">Confirm passphrase</span>
                  <input
                    type="password"
                    value={sealConfirm}
                    onChange={(e) => {
                      setSealConfirm(e.target.value);
                      setSealError('');
                    }}
                    autoComplete="off"
                    aria-label="Confirm passphrase"
                    disabled={sealBusy}
                    className="w-full p-2 rounded-sm border-2 focus:outline-hidden italic text-amber-50 disabled:opacity-50"
                    style={{
                      background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)',
                      borderColor: 'rgba(126, 34, 206, 0.6)',
                    }}
                  />
                </label>
                <p className="text-xs italic text-amber-700/85">
                  ⚠ Keep this passphrase safe — sealed content cannot be recovered without it.
                </p>
                {sealError && (
                  <div
                    role="alert"
                    className="w-full p-2 rounded-sm text-xs italic"
                    style={{
                      background: 'rgba(127, 29, 29, 0.5)',
                      border: '1px solid rgba(239, 68, 68, 0.7)',
                      color: '#fecaca',
                    }}
                  >
                    ✗ {sealError}
                  </div>
                )}
                <button
                  onClick={handleSeal}
                  disabled={sealBusy || sealPass.length < 8 || sealPass !== sealConfirm}
                  className="py-2 font-bold rounded-sm flex items-center justify-center gap-2 text-amber-50 border-2 border-purple-300 italic disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                  style={{
                    background: 'linear-gradient(to bottom, #9333ea 0%, #6b21a8 100%)',
                    boxShadow: '0 0 18px rgba(168, 85, 247, 0.5)',
                  }}
                >
                  {sealBusy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Sealing…
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" aria-hidden="true" /> Seal &amp; download
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
        <div className="p-4 border-t border-purple-700/50 flex gap-2">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-sm border-2 border-amber-700 text-amber-200 italic"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
          >
            Close
          </button>
          {!isLarge && (
            <button
              onClick={copy}
              className="flex-1 py-3 font-bold rounded-sm flex items-center justify-center gap-2 text-amber-50 border-2 border-purple-300 italic"
              style={{
                background: 'linear-gradient(to bottom, #a855f7 0%, #6b21a8 100%)',
                boxShadow: '0 0 20px rgba(168, 85, 247, 0.5)',
              }}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" /> Inscribed!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> Copy Share Code
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShareTomeModal;
