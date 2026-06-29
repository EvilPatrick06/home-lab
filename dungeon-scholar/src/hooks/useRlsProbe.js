import { useEffect, useState } from 'react';
import { checkRlsExposure } from '../services/cloudSync.js';

// M11 (18C): after sign-in, probe whether other users' saves rows are readable
// (RLS off / mis-policied). Read-only, so a StrictMode double-invoke is
// harmless. Extracted from the App.jsx God-component; returns the exposure flag
// plus its setter so the warning banner can be dismissed.
export function useRlsProbe(user) {
  const [rlsExposed, setRlsExposed] = useState(false);
  useEffect(() => {
    if (!user?.id) {
      setRlsExposed(false);
      return;
    }
    let active = true;
    checkRlsExposure(user.id)
      .then((r) => {
        if (active && r.checked) setRlsExposed(r.exposed);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id]);
  return { rlsExposed, setRlsExposed };
}
