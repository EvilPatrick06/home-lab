import { useCallback, useEffect, useMemo, useState } from 'react'
import { addToast } from '../../../../hooks/use-toast'
import { useT } from '../../../../i18n'
import { load5eCrafting, loadJson } from '../../../../services/data-provider'
import type { CraftingToolEntry } from '../../../../types/data'
import { logger } from '../../../../utils/logger'

interface CraftingRecipe {
  id: string
  name: string
  dc: number
  time: string
  cost: string
  components: string[]
  result: string
  description: string
}

interface RecipeFile {
  name: string
  tool: string
  recipes: CraftingRecipe[]
}

interface CraftingItem {
  name: string
  rawMaterialCost: string
  craftingTimeDays: number
  category: string
}

type CraftingCategory = 'all' | 'weapon' | 'armor' | 'gear' | 'recipe'

interface CraftingBrowserProps {
  characterTools: string[]
  onStartCrafting: (item: string, tool: string, days: number, cost: string, recipeId?: string) => void
}

const RECIPE_FILES = [
  './data/5e/equipment/recipes/alchemist-recipes.json',
  './data/5e/equipment/recipes/smith-recipes.json',
  './data/5e/equipment/recipes/herbalist-recipes.json',
  './data/5e/equipment/recipes/poisoner-recipes.json'
]

export default function CraftingBrowser({ characterTools, onStartCrafting }: CraftingBrowserProps): JSX.Element {
  const { t } = useT()
  const [craftingData, setCraftingData] = useState<CraftingToolEntry[]>([])
  const [recipes, setRecipes] = useState<RecipeFile[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CraftingCategory>('all')

  // biome-ignore lint/correctness/useExhaustiveDependencies: Mount-once effect ([] deps) loads crafting data + recipes; uses t only for error toasts. Adding fresh-each-render t would re-run the load every render.
  useEffect(() => {
    load5eCrafting()
      .then(setCraftingData)
      .catch((err) => {
        logger.error('Failed to load crafting data', err)
        addToast(t('game.craftingBrowser.loadDataError'), 'error')
        setCraftingData([])
      })
    Promise.all(RECIPE_FILES.map((f) => loadJson<RecipeFile>(f)))
      .then(setRecipes)
      .catch((err) => {
        logger.error('Failed to load crafting recipes', err)
        addToast(t('game.craftingBrowser.loadRecipesError'), 'error')
        setRecipes([])
      })
  }, [])

  const hasTool = useCallback(
    (toolName: string): boolean => characterTools.some((tool) => tool.toLowerCase() === toolName.toLowerCase()),
    [characterTools]
  )

  // Flatten all items with tool info
  const allItems = useMemo(() => {
    const items: Array<{
      name: string
      tool: string
      cost: string
      days: number
      category: string
      hasProficiency: boolean
      dc?: number
      recipeId?: string
      description?: string
    }> = []

    // Standard crafting items
    for (const toolEntry of craftingData) {
      for (const item of toolEntry.items as CraftingItem[]) {
        items.push({
          name: item.name,
          tool: toolEntry.tool,
          cost: item.rawMaterialCost,
          days: item.craftingTimeDays,
          category: item.category,
          hasProficiency: hasTool(toolEntry.tool)
        })
      }
    }

    // Specialty recipes
    for (const file of recipes) {
      for (const recipe of file.recipes) {
        items.push({
          name: recipe.name,
          tool: file.tool,
          cost: recipe.cost,
          days: parseInt(recipe.time, 10) || 1,
          category: 'recipe',
          hasProficiency: hasTool(file.tool),
          dc: recipe.dc,
          recipeId: recipe.id,
          description: recipe.description
        })
      }
    }

    return items
  }, [craftingData, recipes, hasTool])

  const filtered = useMemo(() => {
    let result = allItems
    if (category !== 'all') {
      result = result.filter((i) => i.category === category)
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter((i) => i.name.toLowerCase().includes(q) || i.tool.toLowerCase().includes(q))
    }
    // Sort: proficient items first, then alphabetically
    return result.sort((a, b) => {
      if (a.hasProficiency !== b.hasProficiency) return a.hasProficiency ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [allItems, category, search])

  const categories: { id: CraftingCategory }[] = [
    { id: 'all' },
    { id: 'weapon' },
    { id: 'armor' },
    { id: 'gear' },
    { id: 'recipe' }
  ]

  return (
    <div className="space-y-3">
      {/* Search */}
      <input
        aria-label={t('game.craftingBrowser.searchPlaceholder')}
        type="text"
        placeholder={t('game.craftingBrowser.searchPlaceholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-surface-2 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500"
      />

      {/* Category tabs */}
      <div className="flex gap-1">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`px-2 py-1 text-xs rounded cursor-pointer ${
              category === c.id ? 'bg-amber-600 text-white' : 'bg-gray-700 text-muted hover:bg-gray-600'
            }`}
          >
            {t(`game.craftingBrowser.categories.${c.id}`)}
          </button>
        ))}
      </div>

      {/* Item list */}
      <div className="max-h-[350px] overflow-y-auto space-y-1">
        {filtered.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-4">{t('game.craftingBrowser.noItems')}</p>
        )}
        {filtered.map((item, i) => (
          <div
            key={`${item.name}-${item.tool}-${i}`}
            className={`px-3 py-2 rounded-lg border text-xs ${
              item.hasProficiency ? 'bg-surface-2/50 border-border/50' : 'bg-surface-2/20 border-gray-800/30 opacity-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${item.hasProficiency ? 'text-gray-200' : 'text-gray-500'}`}>
                    {item.name}
                  </span>
                  {item.dc && (
                    <span className="text-xs px-1.5 py-0.5 bg-red-600/20 text-red-400 rounded">
                      {t('game.craftingBrowser.dc', { dc: item.dc })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                  <span className={item.hasProficiency ? 'text-green-400' : 'text-red-400'}>
                    {item.hasProficiency ? '\u2713' : '\u2717'} {item.tool}
                  </span>
                  <span>{item.cost}</span>
                  <span>{t('game.craftingBrowser.days', { count: item.days })}</span>
                </div>
                {item.description && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
              </div>
              <button
                onClick={() => onStartCrafting(item.name, item.tool, item.days, item.cost, item.recipeId)}
                disabled={!item.hasProficiency}
                className="px-2 py-1 text-xs bg-amber-600 hover:bg-accent-strong text-white rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ml-2 shrink-0"
              >
                {t('game.craftingBrowser.craft')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Multi-crafter note */}
      <p className="text-xs text-gray-500 italic">{t('game.craftingBrowser.multiCrafterNote')}</p>
    </div>
  )
}
