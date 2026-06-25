import { Copy, Scroll } from 'lucide-react';
import PasteSubmitModal from './PasteSubmitModal.jsx';

// Thin config over the shared PasteSubmitModal (S19).
function PasteTomeModal({ onClose, onSubmit }) {
  return (
    <PasteSubmitModal
      onClose={onClose}
      onSubmit={onSubmit}
      accent="amber"
      maxW="max-w-3xl"
      minH="min-h-[300px]"
      ariaLabel="Paste tome text"
      title="✦ Paste Tome Text ✦"
      TitleIcon={Copy}
      SubmitIcon={Scroll}
      intro={
        '"Paste the tome\'s sacred text below. Code-block fences (```json) shall be stripped automatically. Only valid tome JSON shall be accepted."'
      }
      placeholder={'{"metadata": {"title": "..."}, "flashcards": [...], ...}'}
      emptyError="Paste the tome text first"
      failError="Could not parse — make sure you pasted the entire JSON object"
      submitLabel={(text) => (text.trim() ? 'Inscribe the Tome' : 'Paste JSON first')}
      closeAriaLabel="Close paste tome dialog"
    />
  );
}

export default PasteTomeModal;
