import { useState } from 'react';
import { findItem, ITEMS, RECIPES } from '../../game/items.js';

// Phase 16 — Crafting bench. Spend gathered ingredients to brew run-grade
// potions without the Marketplace's gold cost.
function CraftingScreen({ playerState, setScreen, onCraft }) {
  const inv = playerState.inventory || {};
  const ingredients = ITEMS.filter((it) => it.category === 'ingredient');
  const ownedIngredients = ingredients.map((it) => ({ ...it, count: inv[it.id] || 0 })).filter((it) => it.count > 0);
  const ingredientHave = (id) => inv[id] || 0;
  const [feedback, setFeedback] = useState(null);

  const tryCraft = (recipe) => {
    if (!onCraft) return;
    const res = onCraft(recipe.id);
    if (!res?.ok) {
      setFeedback({ recipeId: recipe.id, text: res?.reason || 'Could not brew.', tone: 'bad' });
      setTimeout(() => setFeedback(null), 1800);
    }
  };

  return (
    <div className="space-y-6">
      <div
        className="p-6 rounded-sm relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-emerald, 6, 78, 59), 0.4) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
          border: '3px double rgba(16, 185, 129, 0.6)',
          boxShadow: '0 0 30px rgba(16, 185, 129, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
        }}
      >
        <div className="absolute top-2 left-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-emerald-400 text-sm">⚜</div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="text-4xl">🌿</div>
            <div>
              <h2
                className="text-2xl font-bold text-emerald-200 italic"
                style={{ textShadow: '0 0 12px rgba(16, 185, 129, 0.4)' }}
              >
                The Brewing Bench
              </h2>
              <div className="text-xs text-emerald-400 tracking-[0.2em] italic">
                ⚜ COMBINE REAGENTS · BREW POTIONS ⚜
              </div>
              <div className="text-xs text-amber-100/70 italic mt-1">
                Reagents are harvested from plants and chests in the dungeon.
              </div>
            </div>
          </div>
          <button
            onClick={() => setScreen('inventory')}
            className="px-3 py-2 rounded-sm text-xs italic border-2 border-emerald-700 text-emerald-300 hover:bg-emerald-900/30"
            style={{ background: 'rgba(var(--surface-emerald, 6, 78, 59), 0.45)' }}
          >
            ← Back to The Hoard
          </button>
        </div>
      </div>

      {/* Ingredient inventory ribbon */}
      <div
        className="p-4 rounded-sm"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-purple, 31, 12, 41), 0.6) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
          border: '2px solid rgba(126, 34, 206, 0.4)',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">🧺</span>
          <h4 className="text-xs font-bold italic text-amber-200 tracking-wider">Reagents on hand</h4>
          <div className="flex-1 h-px bg-linear-to-r from-amber-700/40 to-transparent" />
          <span className="text-[10px] italic text-accent-muted">
            {ownedIngredients.length}/{ingredients.length} kinds
          </span>
        </div>
        {ownedIngredients.length === 0 ? (
          <p className="text-xs italic text-accent-muted-80">
            Thy basket lies empty. Walk over plants in the dungeon to gather what thou needest.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {ownedIngredients.map((it) => (
              <div
                key={it.id}
                className="px-2 py-1 rounded-sm flex items-center gap-1 text-xs italic"
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(var(--surface-amber-strong, 120, 53, 15),0.4)',
                  color: '#fde68a',
                }}
              >
                <span>{it.icon}</span>
                <span>{it.name}</span>
                <span className="text-amber-300 font-bold">×{it.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recipe cards */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📜</span>
          <h3
            className="text-lg font-bold text-amber-200 italic tracking-wider"
            style={{ textShadow: '0 0 8px rgba(245, 158, 11, 0.3)' }}
          >
            Known Recipes
          </h3>
          <div className="flex-1 h-px bg-linear-to-r from-amber-700/50 to-transparent" />
          <span className="text-xs text-accent-muted italic">{RECIPES.length} brews</span>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {RECIPES.map((recipe) => {
            const result = findItem(recipe.resultId);
            const canCraft = Object.entries(recipe.ingredients).every(([id, n]) => ingredientHave(id) >= n);
            const ownedResult = inv[recipe.resultId] || 0;
            const isFlash = feedback && feedback.recipeId === recipe.id;
            return (
              <div
                key={recipe.id}
                className="p-4 rounded-sm relative"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(20, 30, 24, 0.7) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
                  border: `2px solid ${canCraft ? 'rgba(34, 197, 94, 0.55)' : 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.4)'}`,
                  boxShadow: canCraft ? '0 0 14px rgba(34, 197, 94, 0.18)' : 'inset 0 0 12px rgba(0,0,0,0.4)',
                }}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="text-3xl">{result?.icon || recipe.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="font-bold text-amber-200 italic text-sm">{recipe.name}</h4>
                      <span className="text-[10px] italic text-accent-muted">Owned ×{ownedResult}</span>
                    </div>
                    <p className="text-[11px] italic text-amber-100/70 mt-0.5">{result?.description}</p>
                  </div>
                </div>
                <div className="space-y-1 mb-3">
                  {Object.entries(recipe.ingredients).map(([id, n]) => {
                    const ing = findItem(id);
                    const have = ingredientHave(id);
                    const enough = have >= n;
                    return (
                      <div key={id} className="flex items-center justify-between text-xs italic">
                        <div className="flex items-center gap-1">
                          <span>{ing?.icon || '🌿'}</span>
                          <span className={enough ? 'text-amber-200' : 'text-rose-300/80'}>{ing?.name || id}</span>
                        </div>
                        <span className={`tabular-nums font-bold ${enough ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {have}/{n}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => tryCraft(recipe)}
                  disabled={!canCraft}
                  className="w-full px-3 py-2 rounded-sm text-xs italic font-bold"
                  style={{
                    background: canCraft ? 'linear-gradient(to bottom, #34d399 0%, #059669 100%)' : 'rgba(31,17,8,0.5)',
                    border: canCraft
                      ? '2px solid #6ee7b7'
                      : '1px solid rgba(var(--surface-amber-strong, 120, 53, 15),0.4)',
                    color: canCraft ? '#022c22' : '#52443a',
                    cursor: canCraft ? 'pointer' : 'not-allowed',
                    boxShadow: canCraft ? '0 0 10px rgba(16,185,129,0.4)' : 'none',
                  }}
                >
                  {canCraft ? 'Brew' : 'Missing reagents'}
                </button>
                {isFlash && <div className="text-[10px] italic mt-1 text-rose-300">{feedback.text}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default CraftingScreen;
