// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EntityRecordsPanel from './EntityRecordsPanel'

const getEntities = vi.fn()
const setEntitiesConfig = vi.fn()
const upsertEntity = vi.fn()
const deleteEntity = vi.fn()

const RECORD = {
  id: 'volo',
  name: 'Volo',
  kind: 'npc',
  summary: 'a barkeep',
  details: '',
  aliases: [],
  keywords: [],
  injection: 'auto',
  source: 'dm',
  locked: true,
  mentions: 3
}

beforeEach(() => {
  getEntities.mockResolvedValue({
    success: true,
    config: { enabled: false, autoExtract: false, loreMode: 'all' },
    records: [RECORD]
  })
  setEntitiesConfig.mockResolvedValue({ success: true, config: { enabled: true, autoExtract: false, loreMode: 'all' } })
  upsertEntity.mockResolvedValue({ success: true, applied: true, detail: 'updated by DM' })
  deleteEntity.mockResolvedValue({ success: true, deleted: true })
  // biome-ignore lint/suspicious/noExplicitAny: test stub of the preload api surface
  ;(window as any).api = { ai: { getEntities, setEntitiesConfig, upsertEntity, deleteEntity } }
})
afterEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: cleanup
  ;(window as any).api = undefined
  vi.clearAllMocks()
})

describe('EntityRecordsPanel (PHASE-25 25F)', () => {
  it('loads records on mount and shows the locked indicator', async () => {
    render(<EntityRecordsPanel campaignId="c1" />)
    expect(await screen.findByText('Volo')).toBeTruthy()
    expect(getEntities).toHaveBeenCalledWith('c1')
    expect(screen.getByText(/🔒/)).toBeTruthy() // locked padlock
  })

  it('toggling Entity memory calls setEntitiesConfig with the patch', async () => {
    render(<EntityRecordsPanel campaignId="c1" />)
    await screen.findByText('Volo')
    fireEvent.click(screen.getByLabelText('Entity memory'))
    await waitFor(() => expect(setEntitiesConfig).toHaveBeenCalledWith('c1', { enabled: true }))
  })

  it('saving the modal upserts the record with source:dm', async () => {
    render(<EntityRecordsPanel campaignId="c1" />)
    await screen.findByText('Volo')
    fireEvent.click(screen.getByText('+ Add'))
    const inputs = screen.getAllByRole('textbox') // [name, summary, details, aliases, keywords]
    fireEvent.change(inputs[0], { target: { value: 'Ama Tilen' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(upsertEntity).toHaveBeenCalled())
    expect(upsertEntity).toHaveBeenCalledWith('c1', expect.objectContaining({ name: 'Ama Tilen', source: 'dm' }))
  })
})
