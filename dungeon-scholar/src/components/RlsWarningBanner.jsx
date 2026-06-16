// PHASE-18 18C / M11 — persistent critical banner shown when checkRlsExposure
// detects that signed-in users can read other users' saves (Row Level Security
// not active on the `saves` table). A misconfiguration alarm, not a setting:
// dismissal is session-local and it re-probes on next sign-in/reload.
export function RlsWarningBanner({ onDismiss }) {
  return (
    <div role="alert" className="fixed top-0 inset-x-0 z-50 px-4 py-3 text-sm italic text-red-100 border-b-2 border-red-700" style={{ background: 'rgba(80, 10, 10, 0.97)' }}>
      <strong>⚠ Cloud misconfiguration:</strong> this Supabase project lets signed-in users read other users&apos; saves —
      Row Level Security is not active on the <code>saves</code> table. Cloud sync is unsafe until it is fixed.
      Run the verification SQL in <code>docs/supabase-setup.md</code> (step 8).
      {onDismiss && (
        <button onClick={onDismiss} className="ml-3 underline text-red-200" aria-label="Dismiss warning">Dismiss</button>
      )}
    </div>
  );
}
