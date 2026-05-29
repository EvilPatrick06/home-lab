import { useCallback, useSyncExternalStore } from 'react'
import { cryptoRandom } from '../utils/crypto-random'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
  duration: number
}

const MAX_VISIBLE = 3
let toasts: Toast[] = []
let listeners: Array<() => void> = []
// Phase 22b — track each toast's auto-dismiss timer so a manual dismiss clears it
// (otherwise the stale timer fires dismissToast on an already-gone id — harmless
// but wasteful, and the timer leaks until it fires).
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>()

function emit(): void {
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

function getSnapshot(): Toast[] {
  return toasts
}

export function addToast(message: string, variant: ToastVariant = 'info', duration = 4000): void {
  const id = `toast-${Date.now()}-${cryptoRandom().toString(36).slice(2, 8)}`
  const toast: Toast = { id, message, variant, duration }

  toasts = [...toasts, toast].slice(-MAX_VISIBLE)
  emit()

  if (duration > 0) {
    dismissTimers.set(
      id,
      setTimeout(() => dismissToast(id), duration)
    )
  }
}

export function dismissToast(id: string): void {
  const timer = dismissTimers.get(id)
  if (timer) {
    clearTimeout(timer)
    dismissTimers.delete(id)
  }
  const prev = toasts
  toasts = toasts.filter((t) => t.id !== id)
  if (toasts !== prev) emit()
}

export function useToast(): {
  toasts: Toast[]
  addToast: (message: string, variant?: ToastVariant, duration?: number) => void
  dismissToast: (id: string) => void
} {
  const current = useSyncExternalStore(subscribe, getSnapshot)
  return {
    toasts: current,
    addToast: useCallback(addToast, []),
    dismissToast: useCallback(dismissToast, [])
  }
}
