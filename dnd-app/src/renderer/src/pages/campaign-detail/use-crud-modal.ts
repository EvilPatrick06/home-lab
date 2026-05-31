import { type Dispatch, type SetStateAction, useState } from 'react'
import type { Campaign } from '../../types/campaign'

interface UseCrudModalOptions<TItem, TForm> {
  campaign: Campaign
  saveCampaign: (c: Campaign) => Promise<void>
  /** The blank form used for "add" and as the initial state. */
  emptyForm: TForm
  /** Project an existing item back into the editable form for "edit". */
  toForm: (item: TItem) => TForm
}

export interface CrudModal<TItem, TForm> {
  showModal: boolean
  editing: TItem | null
  form: TForm
  setForm: Dispatch<SetStateAction<TForm>>
  openAdd: () => void
  openEdit: (item: TItem) => void
  close: () => void
  /** `saveCampaign({ ...campaign, ...patch, updatedAt: now })` — the shared persist. */
  persist: (patch: Partial<Campaign>) => Promise<void>
}

/**
 * Shared modal-CRUD state machine for the campaign-detail managers
 * (`RuleManager` / `LoreManager`): owns the `{showModal, editing, form}` dance
 * (openAdd resets the form, openEdit loads it, close hides) plus the
 * `saveCampaign`-with-`updatedAt` persist. Each manager keeps its own
 * field-specific upsert + render.
 *
 * `NPCManager` deliberately opts out — its stat-block-linking state is too
 * entangled to share cleanly.
 */
export function useCrudModal<TItem, TForm>({
  campaign,
  saveCampaign,
  emptyForm,
  toForm
}: UseCrudModalOptions<TItem, TForm>): CrudModal<TItem, TForm> {
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<TItem | null>(null)
  const [form, setForm] = useState<TForm>(emptyForm)

  const openAdd = (): void => {
    setEditing(null)
    setForm(emptyForm)
    setShowModal(true)
  }
  const openEdit = (item: TItem): void => {
    setEditing(item)
    setForm(toForm(item))
    setShowModal(true)
  }
  const close = (): void => setShowModal(false)
  const persist = (patch: Partial<Campaign>): Promise<void> =>
    saveCampaign({ ...campaign, ...patch, updatedAt: new Date().toISOString() })

  return { showModal, editing, form, setForm, openAdd, openEdit, close, persist }
}
