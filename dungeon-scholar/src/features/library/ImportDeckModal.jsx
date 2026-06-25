import { FileUp, Table } from 'lucide-react';
import PasteSubmitModal from './PasteSubmitModal.jsx';

// Import a deck from CSV / TSV / Quizlet export text (item: external deck-format
// import). Thin config over the shared PasteSubmitModal; the parent's onSubmit
// runs the text through deckTextToTome -> the normal addTomeToLibrary path.
function ImportDeckModal({ onClose, onSubmit }) {
  return (
    <PasteSubmitModal
      onClose={onClose}
      onSubmit={onSubmit}
      accent="amber"
      maxW="max-w-3xl"
      minH="min-h-[300px]"
      ariaLabel="Import deck from CSV or Quizlet"
      title="✦ Import Deck (CSV / Quizlet) ✦"
      TitleIcon={FileUp}
      SubmitIcon={Table}
      intro={
        '"Paste CSV or a Quizlet export below. One card per line — front, then back (comma- or tab-separated). An optional third column becomes the card\'s domain tag. A header row (front,back / term,definition) is detected and skipped."'
      }
      placeholder={
        'What is 2+2?,Four\nCapital of France,Paris\n\n(or Quizlet tab-export)\nmitochondria\tpowerhouse of the cell'
      }
      emptyError="Paste CSV or Quizlet text first"
      failError="Could not parse — each line needs a front and a back (comma- or tab-separated)"
      submitLabel={(text) => (text.trim() ? 'Convert & Inscribe' : 'Paste a deck first')}
      closeAriaLabel="Close import deck dialog"
    />
  );
}

export default ImportDeckModal;
