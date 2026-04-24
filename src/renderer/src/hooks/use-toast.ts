import { useCallback, useSyncExternalStore } from 'react'

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
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const toast: Toast = { id, message, variant, duration }

  toasts = [...toasts, toast].slice(-MAX_VISIBLE)
  emit()

  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration)
  }
}

export function dismissToast(id: string): void {
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
