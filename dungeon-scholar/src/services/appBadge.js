// PWA App Badging (sugg-pwa-badging).
//
// Show the due-card count on the installed PWA icon (home-screen / taskbar /
// dock) via the App Badging API. This is a passive, glanceable re-engagement
// nudge that needs no notification permission. Feature-detected and degrades
// gracefully: Chromium/Android/desktop support it; iOS Safari and Firefox lack
// it and the calls simply no-op (matching the app's other progressive-
// enhancement features like the Web Share Target).

export function appBadgingSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.setAppBadge === 'function';
}

// Set the installed-icon badge to `count` due cards. A count of 0 clears the
// badge (per the spec, setAppBadge(0) or an empty call clears it, but we call
// clearAppBadge explicitly for clarity). Non-finite/negative counts clear too.
// Best-effort: any rejection (the API is async and can throw) is swallowed so a
// badge failure never affects study flow. Returns true if a call was attempted.
export function updateDueBadge(count) {
  if (!appBadgingSupported()) return false;
  const n = Math.floor(Number(count));
  try {
    if (!Number.isFinite(n) || n <= 0) {
      const p = navigator.clearAppBadge?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else {
      const p = navigator.setAppBadge(n);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

export function clearDueBadge() {
  return updateDueBadge(0);
}
