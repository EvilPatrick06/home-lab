import { useState, useMemo } from 'react';
import { Wand2, X, Check, ArrowLeft } from 'lucide-react';
import { ORG_PROMPTS } from '../prompts/index.js';

const EXAM_TARGET_LEAVE_BLANK = '<leave blank to let me infer from materials>';
const EXAM_TARGET_LINE_REGEX = /EXAM TARGET: <[^>]+>/;

function buildFinalPrompt(promptTemplate, examTarget) {
  const target = examTarget.trim() || EXAM_TARGET_LEAVE_BLANK;
  return promptTemplate.replace(EXAM_TARGET_LINE_REGEX, `EXAM TARGET: ${target}`);
}

function copyToClipboard(text) {
  let success = false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      success = document.execCommand('copy');
    } catch (e) {
      success = false;
    }
    document.body.removeChild(ta);
  } catch (e) {
    success = false;
  }
  if (!success && navigator.clipboard) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  return Promise.resolve(success);
}

const MODAL_SHELL_STYLE = {
  background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.97) 0%, rgba(10, 6, 4, 0.99) 100%)',
  border: '3px double rgba(245, 158, 11, 0.6)',
  boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
};

function ModalShell({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4">
      <div
        className="rounded max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col relative"
        style={MODAL_SHELL_STYLE}
      >
        {children}
      </div>
    </div>
  );
}

function OrgPicker({ orgs, onPick, onClose }) {
  return (
    <>
      <div className="p-4 border-b border-amber-700/50 flex justify-between items-center">
        <h3 className="text-xl font-bold text-amber-300 flex items-center gap-2 italic">
          <Wand2 className="w-5 h-5" /> ✦ Spell of Tome Creation ✦
        </h3>
        <button
          onClick={onClose}
          aria-label="close"
          className="p-2 hover:bg-amber-900/30 rounded text-amber-300"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-4 overflow-y-auto flex-1">
        <p className="text-sm text-amber-100/80 mb-4 italic">
          &ldquo;Choose the order whose exams thou wouldst conquer. Each holds a tome-forging spell tuned to its trials.&rdquo;
        </p>
        <div className="space-y-2">
          {orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => onPick(org.id)}
              className="w-full text-left p-3 rounded transition border-2 border-amber-700/50 hover:border-amber-400 hover:bg-amber-900/20 text-amber-100 italic"
              style={{ background: 'rgba(10, 6, 4, 0.5)' }}
            >
              <div className="font-bold flex items-center gap-2">
                <span className="text-2xl">{org.emoji}</span>
                <span className="text-amber-300">{org.name}</span>
              </div>
              <div className="text-xs text-amber-100/60 mt-1 ml-9">{org.subtitle}</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function PromptViewer({ org, examTarget, setExamTarget, finalPrompt, copied, onCopy, onBack, onClose }) {
  return (
    <>
      <div className="p-4 border-b border-amber-700/50 flex justify-between items-center">
        <button
          onClick={onBack}
          aria-label="back"
          className="p-2 hover:bg-amber-900/30 rounded text-amber-300"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h3 className="text-xl font-bold text-amber-300 flex items-center gap-2 italic">
          <span className="text-2xl">{org.emoji}</span>
          ✦ {org.name} Tome Spell ✦
        </h3>
        <button
          onClick={onClose}
          aria-label="close"
          className="p-2 hover:bg-amber-900/30 rounded text-amber-300"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-4 overflow-y-auto flex-1">
        <label className="block mb-3">
          <span className="text-xs text-amber-300 italic block mb-1">
            ✦ Name thy chosen trial — Exam Target (optional)
          </span>
          <input
            type="text"
            value={examTarget}
            onChange={(e) => setExamTarget(e.target.value)}
            placeholder={org.examTargetPlaceholder}
            maxLength={250}
            className="w-full p-2 rounded border-2 focus:outline-none italic text-amber-50"
            style={{ background: 'rgba(10, 6, 4, 0.7)', borderColor: 'rgba(120, 53, 15, 0.7)' }}
          />
        </label>
        <p className="text-xs text-amber-100/70 mb-2 italic">
          &ldquo;Speak this incantation to any AI familiar (Claude, ChatGPT, Gemini), then offer them your study materials.&rdquo;
        </p>
        <pre
          data-testid="prompt-preview"
          className="rounded p-4 text-xs whitespace-pre-wrap overflow-auto max-h-[40vh]"
          style={{
            background: 'rgba(10, 6, 4, 0.7)',
            border: '1px solid rgba(120, 53, 15, 0.5)',
            color: '#fcd34d',
            fontFamily: 'monospace',
          }}
        >
          {finalPrompt}
        </pre>
      </div>
      <div className="p-4 border-t border-amber-700/50 flex gap-2">
        <button
          onClick={onCopy}
          className="flex-1 py-3 font-bold rounded flex items-center justify-center gap-2 text-amber-950 border-2 border-amber-300 italic"
          style={{
            background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
            boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)',
          }}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" /> Inscribed!
            </>
          ) : (
            <>📜 Copy the Spell</>
          )}
        </button>
      </div>
    </>
  );
}

export default function PromptModal({ onClose }) {
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [examTarget, setExamTarget] = useState('');
  const [copied, setCopied] = useState(false);

  const org = selectedOrg ? ORG_PROMPTS.find((o) => o.id === selectedOrg) : null;

  const finalPrompt = useMemo(() => {
    if (!org) return '';
    return buildFinalPrompt(org.prompt, examTarget);
  }, [org, examTarget]);

  const onCopy = async () => {
    const ok = await copyToClipboard(finalPrompt);
    setCopied(ok);
    setTimeout(() => setCopied(false), 2000);
  };

  const onBack = () => {
    setSelectedOrg(null);
    setExamTarget('');
    setCopied(false);
  };

  if (!selectedOrg) {
    return (
      <ModalShell onClose={onClose}>
        <OrgPicker orgs={ORG_PROMPTS} onPick={setSelectedOrg} onClose={onClose} />
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose}>
      <PromptViewer
        org={org}
        examTarget={examTarget}
        setExamTarget={setExamTarget}
        finalPrompt={finalPrompt}
        copied={copied}
        onCopy={onCopy}
        onBack={onBack}
        onClose={onClose}
      />
    </ModalShell>
  );
}
