import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the toast hook before importing clipboard
vi.mock('../hooks/use-toast', () => ({
  addToast: vi.fn()
}))

import { addToast } from '../hooks/use-toast'
import { copyToClipboard } from './clipboard'

const mockAddToast = vi.mocked(addToast)

describe('copyToClipboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Reset addToast mock
    mockAddToast.mockClear()
  })

  it('uses navigator.clipboard.writeText when available', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: writeTextMock } },
      writable: true,
      configurable: true
    })

    const result = await copyToClipboard('hello')
    expect(writeTextMock).toHaveBeenCalledWith('hello')
    expect(result).toBe(true)
  })

  it('shows success toast when successMessage is provided', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: writeTextMock } },
      writable: true,
      configurable: true
    })

    await copyToClipboard('text', 'Copied!')
    expect(mockAddToast).toHaveBeenCalledWith('Copied!', 'success')
  })

  it('does not show toast when no successMessage is provided', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: writeTextMock } },
      writable: true,
      configurable: true
    })

    await copyToClipboard('text')
    expect(mockAddToast).not.toHaveBeenCalled()
  })

  it('falls back to execCommand when navigator.clipboard fails', async () => {
    // Make navigator.clipboard.writeText throw
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Not allowed')) } },
      writable: true,
      configurable: true
    })

    // Mock DOM APIs for the fallback path
    const mockTextarea = {
      value: '',
      style: { position: '', opacity: '' },
      select: vi.fn()
    }
    const appendChildMock = vi.fn()
    const removeChildMock = vi.fn()
    const createElementMock = vi.fn().mockReturnValue(mockTextarea)
    const execCommandMock = vi.fn().mockReturnValue(true)

    Object.defineProperty(globalThis, 'document', {
      value: {
        createElement: createElementMock,
        body: { appendChild: appendChildMock, removeChild: removeChildMock },
        execCommand: execCommandMock
      },
      writable: true,
      configurable: true
    })

    const result = await copyToClipboard('fallback text', 'Copied!')
    expect(result).toBe(true)
    expect(createElementMock).toHaveBeenCalledWith('textarea')
    expect(mockTextarea.value).toBe('fallback text')
    expect(execCommandMock).toHaveBeenCalledWith('copy')
    expect(mockAddToast).toHaveBeenCalledWith('Copied!', 'success')
  })

  it('returns false and shows error toast when both methods fail', async () => {
    // Make navigator.clipboard.writeText throw
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Fail')) } },
      writable: true,
      configurable: true
    })

    // Make execCommand also fail
    Object.defineProperty(globalThis, 'document', {
      value: {
        createElement: vi.fn().mockImplementation(() => {
          throw new Error('No DOM')
        }),
        body: { appendChild: vi.fn(), removeChild: vi.fn() }
      },
      writable: true,
      configurable: true
    })

    const result = await copyToClipboard('text')
    expect(result).toBe(false)
    expect(mockAddToast).toHaveBeenCalledWith('Failed to copy to clipboard', 'error')
  })

  it('returns true for empty string input', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: writeTextMock } },
      writable: true,
      configurable: true
    })

    const result = await copyToClipboard('')
    expect(result).toBe(true)
    expect(writeTextMock).toHaveBeenCalledWith('')
  })
})
