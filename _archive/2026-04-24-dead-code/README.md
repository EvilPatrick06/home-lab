# 2026-04-24 — dead / duplicate renderer + unused plugin runner

| Original path | Reason |
|---------------|--------|
| `dnd-app/.../modals/combat/MountModal.tsx` | Superseded by `modals/mechanics/MountModal.tsx` (lazy-loaded). |
| `dnd-app/.../OllamaSetupStep.tsx` | Zero imports. |
| `dnd-app/.../CloudSyncPanel.tsx`, `CloudSyncButton.tsx`, `use-cloud-sync.ts`, `cloud-sync-service.ts` | Settings uses `window.api.cloudSync` directly; these wrappers unused. |
| `dnd-app/.../use-reduced-motion.ts` | Zero imports. |
| `dnd-app/.../homebrew-validation.ts` | Zero imports. |
| `dnd-app/src/main/plugins/plugin-runner.ts` | Sandbox runner not wired; needs `isolated-vm` when implemented. |

Restore: `git mv` back to paths above from this tree.
