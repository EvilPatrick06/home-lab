import { useCallback, useState } from 'react';

// App-level modal/dialog visibility manager. Extracted from App.jsx (the
// God-component entry) to collapse the cluster of independent `useState(false)`
// modal flags into one hook. Semantics are unchanged: these modals are NOT
// mutually exclusive — any combination may be open at once, exactly like the
// original separate booleans.
export const APP_MODALS = Object.freeze([
  'prompt', // forge/prompt-pack modal
  'achievements', // Hall of Glory
  'titles', // Titles & levels
  'paste', // Paste-tome import
  'resetConfirm', // Reset-progress confirm
  'importCode', // Share-code import
  'importDeck', // CSV/Quizlet deck import
  'occlusionAuthor', // image-occlusion card author
  'welcome', // First-run welcome
  'account', // Account panel
  'shortcuts', // Keyboard-shortcut help overlay
]);

export function useAppModals() {
  const [open, setOpen] = useState(() => Object.fromEntries(APP_MODALS.map((k) => [k, false])));
  const openModal = useCallback((name) => setOpen((prev) => ({ ...prev, [name]: true })), []);
  const closeModal = useCallback((name) => setOpen((prev) => ({ ...prev, [name]: false })), []);
  const setModal = useCallback((name, value) => setOpen((prev) => ({ ...prev, [name]: !!value })), []);
  return { open, openModal, closeModal, setModal };
}
