/**
 * Phase 18e — centralized z-index layer scale for DOM overlays.
 *
 * Ad-hoc `z-50` / `z-[60]` / `z-[9999]` values scattered across overlays made
 * stacking order hard to reason about. These named tiers give every floating
 * DOM layer a single source of truth.
 *
 * NOTE: this governs **DOM overlays only**. PixiJS owns its own internal
 * canvas layer ordering (Phase 12's 16 map layers) — do not route those
 * through these constants.
 *
 * Use as `style={{ zIndex: Z.MODAL }}` (the values intentionally match the
 * Tailwind `z-*` scale so existing `z-50` etc. map cleanly).
 */
export const Z = {
  /** Base map canvas. */
  MAP_CANVAS: 0,
  /** Docked chrome: sidebar, bottom bar. */
  SIDEBAR: 10,
  BOTTOM_BAR: 10,
  /** Floating toolbars anchored to the map (drawing, fog, wall tools). */
  TOOLBAR: 20,
  /** Map overlays: HUDs, prompts, banners. */
  OVERLAY: 30,
  /** Dropdown menus and popovers. */
  DROPDOWN: 40,
  /** Modal scrim. */
  MODAL_BACKDROP: 50,
  /** Modal content. */
  MODAL: 60,
  /** Toasts / alerts above modals. */
  TOAST: 70,
  /** 3D dice canvas overlay. */
  DICE_3D: 80,
  /** Full-screen critical overlays (fatal errors, blocking prompts). */
  CRITICAL_OVERLAY: 90
} as const
