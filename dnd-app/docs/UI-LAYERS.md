# UI Layers — z-index convention (Phase 28f.4)

The app uses a single named z-index scale, **not** ad-hoc `z-[9999]` magic
numbers. The source of truth is [`src/renderer/src/constants/z-index.ts`](../src/renderer/src/constants/z-index.ts)
(the `Z` constant). Apply it as `style={{ zIndex: Z.MODAL }}`; the numeric values
intentionally match the Tailwind `z-*` scale so existing `z-50`-style classes map
cleanly.

There are currently **zero** `z-[9999]` magic z-indexes in `src/`.

## The scale

| Token | Value | Use |
|-------|-------|-----|
| `MAP_CANVAS` | 0 | Base map canvas |
| `SIDEBAR` / `BOTTOM_BAR` | 10 | Docked chrome (sidebar, bottom bar) |
| `TOOLBAR` | 20 | Map-anchored floating toolbars (drawing, fog, wall tools) |
| `OVERLAY` | 30 | Map overlays: HUDs, prompts, banners |
| `DROPDOWN` | 40 | Dropdown menus and popovers |
| `MODAL_BACKDROP` | 50 | Modal scrim |
| `MODAL` | 60 | Modal content |
| `TOAST` | 70 | Toasts / alerts (above modals) |
| `DICE_3D` | 80 | 3D dice canvas overlay |
| `CRITICAL_OVERLAY` | 90 | Full-screen critical overlays (fatal errors, blocking prompts) |

## Rules

1. **Never** introduce a raw `z-[<n>]` / inline `zIndex: <n>`. Add a tier to `Z`
   (or reuse an existing one) and reference it.
2. This governs **DOM overlays only**. PixiJS owns its own internal canvas layer
   ordering (the map's 16 render layers) — do not route those through `Z`.
3. When two layers genuinely need to coexist at the same tier, that's a signal to
   add a new named tier rather than nudging a magic `+1`.
