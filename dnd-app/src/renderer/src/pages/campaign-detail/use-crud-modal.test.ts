// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Campaign } from '../../types/campaign'
import { useCrudModal } from './use-crud-modal'

interface Item {
  id: string
  name: string
}
interface Form {
  name: string
}

function setup(saveCampaign = vi.fn().mockResolvedValue(undefined)) {
  const campaign = { id: 'c1', name: 'Camp' } as unknown as Campaign
  const view = renderHook(() =>
    useCrudModal<Item, Form>({
      campaign,
      saveCampaign,
      emptyForm: { name: '' },
      toForm: (i) => ({ name: i.name })
    })
  )
  return { view, saveCampaign, campaign }
}

describe('useCrudModal', () => {
  it('starts closed with the empty form and no editing target', () => {
    const { view } = setup()
    expect(view.result.current.showModal).toBe(false)
    expect(view.result.current.editing).toBeNull()
    expect(view.result.current.form).toEqual({ name: '' })
  })

  it('openEdit loads the item into the form + sets editing; openAdd resets it', () => {
    const { view } = setup()
    act(() => view.result.current.openEdit({ id: 'r1', name: 'Flanking' }))
    expect(view.result.current.showModal).toBe(true)
    expect(view.result.current.editing).toEqual({ id: 'r1', name: 'Flanking' })
    expect(view.result.current.form).toEqual({ name: 'Flanking' })

    act(() => view.result.current.openAdd())
    expect(view.result.current.showModal).toBe(true)
    expect(view.result.current.editing).toBeNull()
    expect(view.result.current.form).toEqual({ name: '' }) // reset to emptyForm
  })

  it('close hides the modal', () => {
    const { view } = setup()
    act(() => view.result.current.openAdd())
    act(() => view.result.current.close())
    expect(view.result.current.showModal).toBe(false)
  })

  it('persist calls saveCampaign with the patch merged onto the campaign + a fresh updatedAt', async () => {
    const { view, saveCampaign, campaign } = setup()
    await act(async () => {
      await view.result.current.persist({ name: 'Renamed' } as Partial<Campaign>)
    })
    expect(saveCampaign).toHaveBeenCalledTimes(1)
    const arg = saveCampaign.mock.calls[0][0] as Campaign & { name: string; updatedAt: string }
    expect(arg.id).toBe(campaign.id)
    expect(arg.name).toBe('Renamed') // patch applied
    expect(typeof arg.updatedAt).toBe('string') // stamped
  })
})
