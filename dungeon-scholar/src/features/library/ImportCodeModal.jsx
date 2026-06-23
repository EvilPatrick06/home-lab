import { Hash } from 'lucide-react';
import PasteSubmitModal from './PasteSubmitModal.jsx';

// Thin config over the shared PasteSubmitModal (S19).
function ImportCodeModal({ onClose, onSubmit }) {
  return (
    <PasteSubmitModal
      onClose={onClose}
      onSubmit={onSubmit}
      accent="purple"
      maxW="max-w-2xl"
      minH="min-h-[200px]"
      monoBreakAll
      ariaLabel="Import tome code"
      title="✦ Import Share Code ✦"
      TitleIcon={Hash}
      SubmitIcon={Hash}
      intro={'"Paste the sacred share code from a fellow scholar below. The code shall be deciphered and the tome added to thy library."'}
      placeholder="TOME-V1:..."
      emptyError="Paste the share code first"
      failError="Could not decode — make sure the entire code (starting with TOME-V1:) is pasted"
      submitLabel="Decode & Inscribe"
      closeAriaLabel="Close import share code dialog"
    />
  );
}

export default ImportCodeModal;
