import { useState } from 'react'
import type { CustomRule } from '../../types/campaign'
import { Button, Input } from '../ui'

interface RulesStepProps {
  rules: CustomRule[]
  onChange: (rules: CustomRule[]) => void
}

type RuleCategory = CustomRule['category']

const CATEGORIES: Array<{ value: RuleCategory; label: string }> = [
  { value: 'combat', label: 'Combat' },
  { value: 'exploration', label: 'Exploration' },
  { value: 'social', label: 'Social' },
  { value: 'rest', label: 'Rest' },
  { value: 'other', label: 'Other' }
]

const CATEGORY_COLORS: Record<RuleCategory, string> = {
  combat: 'bg-red-900/40 text-red-300',
  exploration: 'bg-green-900/40 text-green-300',
  social: 'bg-blue-900/40 text-blue-300',
  rest: 'bg-purple-900/40 text-purple-300',
  other: 'bg-gray-800 text-gray-300'
}

export default function RulesStep({ rules, onChange }: RulesStepProps): JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newCategory, setNewCategory] = useState<RuleCategory>('other')

  const handleAdd = (): void => {
    if (!newName.trim()) return

    const rule: CustomRule = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      description: newDescription.trim(),
      category: newCategory
    }

    onChange([...rules, rule])
    setNewName('')
    setNewDescription('')
    setNewCategory('other')
    setShowForm(false)
  }

  const handleRemove = (id: string): void => {
    onChange(rules.filter((r) => r.id !== id))
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">House Rules</h2>
      <p className="text-gray-400 text-sm mb-6">
        Add custom house rules for your campaign. This step is optional and you can add more later.
      </p>

      <div className="max-w-2xl">
        {rules.length > 0 && (
          <div className="space-y-3 mb-6">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{rule.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[rule.category]}`}>
                      {rule.category}
                    </span>
                  </div>
                  {rule.description && <p className="text-sm text-gray-400">{rule.description}</p>}
                </div>
                <button
                  onClick={() => handleRemove(rule.id)}
                  className="text-gray-500 hover:text-red-400 transition-colors cursor-pointer text-lg shrink-0"
                  title="Remove rule"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        {showForm ? (
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 space-y-4">
            <Input
              label="Rule Name"
              placeholder="e.g. Critical Hit Bonus"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />

            <div>
              <label className="block text-gray-400 mb-2 text-sm">Description</label>
              <textarea
                className="w-full p-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
                  placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                rows={2}
                placeholder="Describe how this rule works..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-gray-400 mb-2 text-sm">Category</label>
              <select
                className="p-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
                  focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as RuleCategory)}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleAdd} disabled={!newName.trim()}>
                Add Rule
              </Button>
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setShowForm(true)}>
            + Add Rule
          </Button>
        )}

        {rules.length === 0 && !showForm && (
          <p className="text-gray-500 text-sm mt-4">No house rules added. You can skip this step or add rules later.</p>
        )}
      </div>
    </div>
  )
}
