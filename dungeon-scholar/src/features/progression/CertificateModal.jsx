import { Award, Download, Printer, X } from 'lucide-react';
import { useMemo } from 'react';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';
import {
  buildCertificateText,
  certificateFilename,
  downloadDataUrl,
  renderCertificatePng,
} from '../../services/certificate.js';

function printDataUrl(dataUrl) {
  if (!dataUrl || typeof window === 'undefined') return;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(
    `<title>Certificate</title><body style="margin:0"><img src="${dataUrl}" style="max-width:100%" onload="window.focus();window.print();"></body>`,
  );
  w.document.close();
}

const SHELL_STYLE = {
  background:
    'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.97) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.99) 100%)',
  border: '3px double rgba(245, 158, 11, 0.6)',
  boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
};

// Exportable tome-completion certificate. Renders the diploma to a PNG and
// offers Download (PNG) + Print (browser print-to-PDF).
function CertificateModal({ scholarName, tomeTitle, title, masteryPct, onClose }) {
  const panelRef = useDialogA11y({ onClose });
  const dataUrl = useMemo(
    () => renderCertificatePng({ scholarName, tomeTitle, title, masteryPct }),
    [scholarName, tomeTitle, title, masteryPct],
  );
  const text = useMemo(
    () => buildCertificateText({ scholarName, tomeTitle, title, masteryPct }),
    [scholarName, tomeTitle, title, masteryPct],
  );
  const filename = certificateFilename({ tomeTitle });

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Tome completion certificate"
        className="rounded-sm max-w-2xl w-full max-h-[90vh] overflow-auto flex flex-col relative p-5"
        style={SHELL_STYLE}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-amber-200 italic flex items-center gap-2">
            <Award className="w-5 h-5" /> Certificate of Mastery
          </h2>
          <button
            onClick={onClose}
            aria-label="Close certificate dialog"
            className="p-2 rounded-sm border-2 border-amber-700 text-amber-200 hover:bg-amber-900/30"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {dataUrl ? (
          <img
            src={dataUrl}
            alt={`Certificate of mastery for ${text.tomeTitle}`}
            className="w-full rounded-sm border-2 border-amber-800"
          />
        ) : (
          <div className="rounded-sm border-2 border-amber-800 bg-amber-50/95 text-amber-950 p-6 text-center">
            <div className="text-lg font-bold italic">✦ {text.heading} ✦</div>
            <div className="mt-3 italic">{text.intro}</div>
            <div className="text-2xl font-bold">{text.scholarName}</div>
            {text.titleText && <div className="italic">{text.titleText}</div>}
            <div className="mt-2 italic">{text.conferral}</div>
            <div className="text-lg font-bold">“{text.tomeTitle}”</div>
            {text.masteryText && <div className="mt-1">{text.masteryText}</div>}
            <div className="mt-3 text-sm">{text.dateText}</div>
            <div className="italic text-sm">— {text.seal} —</div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-4 flex-wrap">
          <button
            onClick={() => printDataUrl(dataUrl)}
            disabled={!dataUrl}
            className="px-4 py-2 rounded-sm border-2 border-amber-700 text-amber-200 italic flex items-center gap-2 hover:bg-amber-900/30 disabled:opacity-40"
          >
            <Printer className="w-4 h-4" /> Print / Save PDF
          </button>
          <button
            onClick={() => downloadDataUrl(dataUrl, filename)}
            disabled={!dataUrl}
            data-autofocus
            className="px-4 py-2 rounded-sm border-2 border-amber-300 text-amber-950 font-bold italic flex items-center gap-2 disabled:opacity-40"
            style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 50%, #b45309 100%)' }}
          >
            <Download className="w-4 h-4" /> Download PNG
          </button>
        </div>
      </div>
    </div>
  );
}

export default CertificateModal;
