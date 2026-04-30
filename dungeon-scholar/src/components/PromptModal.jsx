import { useState } from 'react';
import { Wand2, X, Check } from 'lucide-react';

export default function PromptModal({ onClose }) {
  const [copied, setCopied] = useState(false);
  const prompt = `You are creating a tome file for Dungeon Scholar, a fantasy-themed cybersecurity study app. I will provide study materials (notes, PDFs, slides, videos, transcripts). Generate a single JSON object with the following structure:

{
  "metadata": {
    "title": "Course Name",
    "description": "Brief description",
    "subject": "Cybersecurity",
    "author": "Optional — your name or source author",
    "difficulty": 3,
    "tags": ["cert-prep", "security-plus", "exam-2024"],
    "version": "1.0"
  },
  "knowledgeBase": "A comprehensive text reference covering all key concepts from the materials. Used by the Oracle (AI tutor) to answer student questions. Should be thorough.",
  "flashcards": [
    {
      "id": "fc1",
      "front": "Term or question",
      "back": "Definition or answer",
      "hint": "Optional hint"
    }
  ],
  "quiz": [
    {
      "id": "q1",
      "type": "multiplechoice",
      "question": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Why this is correct",
      "hint": "Optional hint"
    },
    {
      "id": "q2",
      "type": "truefalse",
      "question": "Statement to evaluate",
      "correctAnswer": true,
      "explanation": "Why",
      "hint": "Optional hint"
    },
    {
      "id": "q3",
      "type": "fillblank",
      "question": "The ___ protocol encrypts web traffic.",
      "acceptedAnswers": ["HTTPS", "https", "TLS"],
      "explanation": "Why",
      "hint": "Optional hint"
    }
  ],
  "labs": [
    {
      "id": "lab1",
      "title": "Lab Title",
      "scenario": "Background context for the lab",
      "steps": [
        {
          "prompt": "Step instruction or question",
          "options": ["A", "B", "C"],
          "correctIndex": 1,
          "explanation": "Why"
        },
        {
          "prompt": "Free response step",
          "acceptedAnswers": ["answer1", "answer 1"],
          "explanation": "Why"
        }
      ]
    }
  ]
}

REQUIREMENTS:
- Generate at least 50 flashcards, 50 quiz questions, and 5 labs
- Mix quiz types (multiplechoice, truefalse, fillblank)
- Make labs realistic scenarios (incident response, configuration, analysis)
- Every item needs a unique id
- Knowledge base should be substantial (cover everything)
- Output ONLY the JSON, no markdown code fences, no commentary

METADATA FIELDS (in metadata object):
- title (required), description (required), version (required)
- subject (optional but recommended): broad subject area like "Cybersecurity", "Computer Science", "Networking"
- author (optional): the source author or course creator if known
- difficulty (optional, integer 1-5): 1=intro, 5=expert
- tags (optional, array of short strings): topical tags like "owasp-top-10", "tcpip", "cert-prep"

OUTPUT FORMAT:
- Save the result as a downloadable .json file (filename: tome-[course-name].json) using whatever file/download capability you have available
- If you cannot create a downloadable file, then output the JSON inside a single code block so I can copy it cleanly
- Do not split the JSON across multiple messages — it must be one complete object

Now wait for me to provide the study materials, then generate the tome file.`;

  const copy = () => {
    let success = false;
    try {
      const ta = document.createElement('textarea');
      ta.value = prompt;
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
      navigator.clipboard.writeText(prompt).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
      return;
    }
    setCopied(success);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4">
      <div className="rounded max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col relative" style={{
        background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.97) 0%, rgba(10, 6, 4, 0.99) 100%)',
        border: '3px double rgba(245, 158, 11, 0.6)', boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
      }}>
        <div className="p-4 border-b border-amber-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-amber-300 flex items-center gap-2 italic">
            <Wand2 className="w-5 h-5" /> ✦ Spell of Tome Creation ✦
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-amber-900/30 rounded text-amber-300"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <p className="text-sm text-amber-100/80 mb-3 italic">"Speak this incantation to any AI familiar (Claude, ChatGPT, Gemini), then offer them your study materials. They shall forge a sacred tome you may import into the library."</p>
          <pre className="rounded p-4 text-xs whitespace-pre-wrap overflow-auto max-h-[50vh]" style={{ background: 'rgba(10, 6, 4, 0.7)', border: '1px solid rgba(120, 53, 15, 0.5)', color: '#fcd34d', fontFamily: 'monospace' }}>{prompt}</pre>
        </div>
        <div className="p-4 border-t border-amber-700/50 flex gap-2">
          <button onClick={copy} className="flex-1 py-3 font-bold rounded flex items-center justify-center gap-2 text-amber-950 border-2 border-amber-300 italic"
            style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)', boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)' }}>
            {copied ? <><Check className="w-4 h-4" /> Inscribed!</> : <>📜 Copy the Spell</>}
          </button>
        </div>
      </div>
    </div>
  );
}
