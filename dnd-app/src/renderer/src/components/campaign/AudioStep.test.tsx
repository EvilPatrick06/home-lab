// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AudioStep, { type CustomAudioEntry } from './AudioStep'

// PHASE-13 13F — object-URL preview + File-map emission.

const createObjectURL = vi.fn(() => 'blob:mock-url')
const revokeObjectURL = vi.fn()
const play = vi.fn()
const pause = vi.fn()

class MockAudio {
  src = ''
  play = play
  pause = pause
  addEventListener = vi.fn()
}

let uuidN = 0

beforeEach(() => {
  uuidN = 0
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  play.mockClear()
  pause.mockClear()
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
  vi.stubGlobal('Audio', MockAudio)
  // Deterministic, unique ids (happy-dom may not implement crypto.randomUUID).
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    writable: true,
    value: () => `uuid-${uuidN++}` as `${string}-${string}-${string}-${string}-${string}`
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const addFile = (container: HTMLElement, name = 'sword.mp3'): File => {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['data'], name, { type: 'audio/mpeg' })
  fireEvent.change(input, { target: { files: [file] } })
  return file
}

/** Controlled wrapper so onChange-driven entries actually render (enabling preview/remove). */
function Harness({ onFilesChange }: { onFilesChange: (m: Map<string, File>) => void }): JSX.Element {
  const [entries, setEntries] = useState<CustomAudioEntry[]>([])
  return <AudioStep audioEntries={entries} onChange={setEntries} onFilesChange={onFilesChange} />
}

describe('AudioStep (PHASE-13 13F)', () => {
  it('emits both metadata and the File map when a file is added', () => {
    const onChange = vi.fn()
    const onFilesChange = vi.fn()
    const { container } = render(<AudioStep audioEntries={[]} onChange={onChange} onFilesChange={onFilesChange} />)

    const file = addFile(container)

    expect(onChange).toHaveBeenCalledTimes(1)
    const entries = onChange.mock.calls[0][0] as CustomAudioEntry[]
    expect(entries).toHaveLength(1)
    expect(entries[0].fileName).toBe('sword.mp3')

    expect(onFilesChange).toHaveBeenCalledTimes(1)
    const map = onFilesChange.mock.calls[0][0] as Map<string, File>
    expect(map.size).toBe(1)
    expect([...map.values()][0]).toBe(file)
  })

  it('ignores non-audio files', () => {
    const onChange = vi.fn()
    const onFilesChange = vi.fn()
    const { container } = render(<AudioStep audioEntries={[]} onChange={onChange} onFilesChange={onFilesChange} />)
    addFile(container, 'notes.txt')
    expect(onChange).not.toHaveBeenCalled()
    expect(onFilesChange).not.toHaveBeenCalled()
  })

  it('preview toggles object-URL create then revoke', () => {
    const onFilesChange = vi.fn()
    const { container } = render(<Harness onFilesChange={onFilesChange} />)
    addFile(container)

    fireEvent.click(screen.getByText('▶')) // ▶ start
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(play).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('■')) // ■ stop
    expect(pause).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('removing an entry drops it from the emitted File map', () => {
    const onFilesChange = vi.fn()
    const { container } = render(<Harness onFilesChange={onFilesChange} />)
    addFile(container)
    expect((onFilesChange.mock.calls.at(-1)?.[0] as Map<string, File>).size).toBe(1)

    fireEvent.click(screen.getByTitle(/remove/i))
    const lastMap = onFilesChange.mock.calls.at(-1)?.[0] as Map<string, File>
    expect(lastMap.size).toBe(0)
  })
})
