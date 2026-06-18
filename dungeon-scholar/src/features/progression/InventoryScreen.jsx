import { useState } from 'react';
import { Package, Coins, ShoppingBag } from 'lucide-react';
import { ITEM_CATEGORIES, ITEMS, findItem } from '../../game/items.js';
import { SpellbookContent } from './SpellbookScreen.jsx';

function InventoryScreen({ playerState, setScreen, onEquip, onUnequip, onEquipPotion, onUnequipPotion, onEquipSpell, onUnequipSpell }) {
  const inv = playerState.inventory || {};
  const equipped = playerState.equipped || {};
  const equippedPotions = equipped.potions || [null, null, null];
  const totalItems = Object.values(inv).reduce((s, n) => s + (n || 0), 0);
  // 25h: split inventory into three tabs so gear, potions, and spells each
  // surface their loadout panel up top with only the relevant item list below.
  const [tab, setTab] = useState('gear');

  const TAB_CATEGORIES = {
    gear:    ['wardrobe', 'armory', 'stable', 'sanctum', 'devotion', 'celestial'],
    potions: ['apothecary', 'ingredient'],
    spells:  ['arcanum'],
  };

  const itemsByCategory = Object.keys(ITEM_CATEGORIES).reduce((acc, cat) => {
    acc[cat] = ITEMS
      .filter(it => it.category === cat && (inv[it.id] || 0) > 0)
      .map(it => ({ ...it, count: inv[it.id] }));
    return acc;
  }, {});

  const SLOTS = [
    { id: 'weapon', label: 'Weapon', icon: '⚔️' },
    { id: 'head',   label: 'Head',   icon: '👑' },
    { id: 'cloak',  label: 'Cloak',  icon: '🌌' },
    { id: 'pet',    label: 'Pet',    icon: '🐾' },
  ];

  const tabCategories = TAB_CATEGORIES[tab] || [];
  const tabItemCount = tabCategories.reduce((s, c) => s + (itemsByCategory[c]?.length || 0), 0);

  const renderCategoryList = (categories) => (
    <div className="space-y-6">
      {categories.map((catId) => {
        const cat = ITEM_CATEGORIES[catId];
        const items = itemsByCategory[catId];
        if (!cat || !items || items.length === 0) return null;
        return (
          <div key={catId} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{cat.icon}</span>
              <h3 className="text-lg font-bold text-amber-200 italic tracking-wider" style={{ textShadow: '0 0 8px rgba(245, 158, 11, 0.3)' }}>
                {cat.label}
              </h3>
              <div className="flex-1 h-px bg-linear-to-r from-amber-700/50 to-transparent" />
              <span className="text-xs text-amber-700 italic">
                {items.length} kind{items.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {items.map((it) => {
                const isEquipped = it.slot && equipped[it.slot] === it.id;
                return (
                <div key={it.id} className="p-4 rounded-sm relative" style={{
                  background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.65) 0%, rgba(10, 6, 4, 0.95) 100%)',
                  border: `2px solid ${isEquipped ? 'rgba(245, 158, 11, 0.7)' : 'rgba(126, 34, 206, 0.45)'}`,
                  boxShadow: isEquipped
                    ? '0 0 14px rgba(245, 158, 11, 0.3), inset 0 0 15px rgba(0,0,0,0.5)'
                    : '0 0 12px rgba(168, 85, 247, 0.12), inset 0 0 15px rgba(0,0,0,0.5)',
                }}>
                  <div className="absolute top-1 left-1 text-amber-700/60 text-xs">⚜</div>
                  <div className="absolute top-1 right-1 text-amber-700/60 text-xs">⚜</div>
                  <div className="absolute bottom-1 left-1 text-amber-700/60 text-xs">⚜</div>
                  <div className="absolute bottom-1 right-1 text-amber-700/60 text-xs">⚜</div>
                  <div className="flex items-start gap-3">
                    <div className="text-3xl shrink-0">{it.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <h4 className="font-bold text-amber-200 italic text-sm" style={{ textShadow: '0 0 6px rgba(245, 158, 11, 0.3)' }}>
                          {it.name}
                          {isEquipped && <span className="ml-2 text-[10px] text-amber-400 italic">(Equipped)</span>}
                        </h4>
                        <span className="text-xs text-amber-300 font-bold italic tabular-nums">×{it.count}</span>
                      </div>
                      <p className="text-xs text-amber-100/70 italic mt-1">{it.description}</p>
                      {it.slot && !it.locked && (
                        <div className="mt-2 flex items-center gap-2">
                          {isEquipped ? (
                            <button
                              onClick={() => onUnequip && onUnequip(it.slot)}
                              className="px-2 py-1 rounded-sm text-[11px] italic"
                              style={{
                                background: 'rgba(31,17,8,0.7)',
                                border: '1px solid rgba(245,158,11,0.6)',
                                color: '#fbbf24',
                              }}
                            >
                              Unequip
                            </button>
                          ) : (
                            <button
                              onClick={() => onEquip && onEquip(it.id)}
                              className="px-2 py-1 rounded-sm text-[11px] italic"
                              style={{
                                background: 'rgba(120,53,15,0.55)',
                                border: '1px solid rgba(245,158,11,0.6)',
                                color: '#fde047',
                              }}
                            >
                              Equip ({it.slot})
                            </button>
                          )}
                        </div>
                      )}
                      {it.category === 'apothecary' && !it.locked && onEquipPotion && (
                        <div className="mt-2 flex items-center gap-1">
                          <span className="text-[10px] text-amber-700 italic mr-1">Quick-slot:</span>
                          {[0, 1, 2].map((i) => {
                            const filledId = equippedPotions[i];
                            const isThis = filledId === it.id;
                            const isOther = filledId && filledId !== it.id;
                            return (
                              <button
                                key={i}
                                onClick={() => {
                                  if (isThis) onUnequipPotion(i);
                                  else onEquipPotion(it.id, i);
                                }}
                                className="px-2 py-0.5 rounded-sm text-[10px] italic"
                                style={{
                                  background: isThis ? 'rgba(120,53,15,0.7)' : 'rgba(31,17,8,0.6)',
                                  border: `1px solid ${isThis ? 'rgba(245,158,11,0.8)' : 'rgba(120,53,15,0.4)'}`,
                                  color: isThis ? '#fde047' : '#a8a29e',
                                }}
                                title={isOther ? `Replace ${findItem(filledId)?.name || 'current'} in slot ${i + 1}` : `Slot ${i + 1}`}
                              >
                                {i + 1}{isThis ? '★' : isOther ? '↺' : ''}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  const TABS = [
    { id: 'gear',    label: 'Gear',    icon: '⚔️', accent: 'rgba(245, 158, 11, 0.6)', text: '#fde047' },
    { id: 'potions', label: 'Potions', icon: '🧪', accent: 'rgba(34, 197, 94, 0.6)',  text: '#86efac' },
    { id: 'spells',  label: 'Spells',  icon: '✦',  accent: 'rgba(96, 165, 250, 0.6)', text: '#93c5fd' },
  ];

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-sm relative" style={{
        background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.4) 0%, rgba(10, 6, 4, 0.95) 100%)',
        border: '3px double rgba(16, 185, 129, 0.6)',
        boxShadow: '0 0 30px rgba(16, 185, 129, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
      }}>
        <div className="absolute top-2 left-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-emerald-400 text-sm">⚜</div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Package className="w-10 h-10 text-emerald-300" style={{ filter: 'drop-shadow(0 0 10px rgba(16, 185, 129, 0.6))' }} />
            <div>
              <h2 className="text-2xl font-bold text-emerald-200 italic" style={{ textShadow: '0 0 12px rgba(16, 185, 129, 0.4)' }}>
                The Hoard
              </h2>
              <div className="text-xs text-emerald-400 tracking-[0.2em] italic">
                ⚜ THY GATHERED TREASURES ⚜
              </div>
              <div className="text-xs text-amber-100/70 italic mt-1">
                {totalItems} item{totalItems === 1 ? '' : 's'} stowed
              </div>
            </div>
          </div>
          <div className="px-4 py-2 rounded-sm border-2 border-amber-700/60 flex items-center gap-2" style={{
            background: 'linear-gradient(to bottom, rgba(120, 53, 15, 0.5), rgba(41, 24, 12, 0.85))',
            boxShadow: '0 0 10px rgba(245, 158, 11, 0.2), inset 0 0 10px rgba(0,0,0,0.4)',
          }}>
            <Coins className="w-5 h-5 text-amber-300" style={{ filter: 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.6))' }} />
            <span className="text-amber-200 font-bold italic text-lg tabular-nums">{playerState.gold || 0}</span>
            <span className="text-amber-700 italic text-xs">gold</span>
          </div>
        </div>
      </div>

      {/* Tab row */}
      <div className="grid grid-cols-3 gap-2">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3 py-2 rounded-sm text-sm italic font-bold tracking-wide"
              style={{
                background: active ? 'rgba(41, 24, 12, 0.85)' : 'rgba(20, 12, 6, 0.5)',
                border: `2px solid ${active ? t.accent : 'rgba(120, 53, 15, 0.3)'}`,
                color: active ? t.text : '#a8a29e',
                boxShadow: active ? `0 0 12px ${t.accent}` : 'none',
              }}
            >
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          );
        })}
      </div>

      {tab === 'gear' && (
        <>
          <div className="rounded-sm p-4 relative" style={{
            background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.35) 0%, rgba(10, 6, 4, 0.92) 100%)',
            border: '2px solid rgba(245, 158, 11, 0.45)',
            boxShadow: '0 0 12px rgba(245, 158, 11, 0.15), inset 0 0 12px rgba(0,0,0,0.5)',
          }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">⚔</span>
              <h3 className="text-base font-bold text-amber-200 italic tracking-wider" style={{ textShadow: '0 0 8px rgba(245,158,11,0.3)' }}>
                Loadout
              </h3>
              <div className="flex-1 h-px bg-linear-to-r from-amber-700/50 to-transparent" />
              <span className="text-[10px] text-amber-700 italic">Equipped gear is active inside the dungeon.</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {SLOTS.map((s) => {
                const equippedId = equipped[s.id];
                const item = equippedId ? findItem(equippedId) : null;
                return (
                  <div key={s.id} className="p-3 rounded-sm flex items-center gap-2" style={{
                    background: 'rgba(31,17,8,0.6)',
                    border: `1px solid ${item ? 'rgba(245,158,11,0.6)' : 'rgba(120,53,15,0.4)'}`,
                  }}>
                    <div className="text-2xl">{item ? item.icon : s.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-amber-700 italic uppercase tracking-wider">{s.label}</div>
                      <div className="text-xs text-amber-200 italic truncate">
                        {item ? item.name : <span className="text-amber-700/60">— Empty —</span>}
                      </div>
                    </div>
                    {item && onUnequip && (
                      <button
                        onClick={() => onUnequip(s.id)}
                        className="text-[10px] text-amber-600 hover:text-amber-300 italic underline"
                        title="Unequip"
                      >
                        Doff
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {tabItemCount === 0 ? (
            <div className="text-center py-12 px-6 rounded-sm relative" style={{
              background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.5) 0%, rgba(10, 6, 4, 0.9) 100%)',
              border: '2px dashed rgba(126, 34, 206, 0.4)',
            }}>
              <Package className="w-12 h-12 mx-auto text-purple-300/50 mb-3" />
              <p className="text-amber-100/70 italic mb-1">No gear stowed.</p>
              <p className="text-xs text-amber-700 italic max-w-md mx-auto">
                Purchase wardrobe, armory, sanctum, or celestial wares at the Marketplace.
              </p>
            </div>
          ) : (
            renderCategoryList(TAB_CATEGORIES.gear)
          )}
        </>
      )}

      {tab === 'potions' && (
        <>
          <div className="rounded-sm p-4 relative" style={{
            background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.35) 0%, rgba(10, 6, 4, 0.92) 100%)',
            border: '2px solid rgba(34, 197, 94, 0.45)',
            boxShadow: '0 0 12px rgba(34, 197, 94, 0.15), inset 0 0 12px rgba(0,0,0,0.5)',
          }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🧪</span>
              <h3 className="text-base font-bold text-emerald-200 italic tracking-wider" style={{ textShadow: '0 0 8px rgba(34,197,94,0.3)' }}>
                Potion Quick-Slots
              </h3>
              <div className="flex-1 h-px bg-linear-to-r from-emerald-700/50 to-transparent" />
              <span className="text-[10px] text-amber-700 italic">Hotkeys 1 · 2 · 3</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => {
                const id = equippedPotions[i];
                const item = id ? findItem(id) : null;
                const count = item ? (inv[item.id] || 0) : 0;
                return (
                  <div key={i} className="p-2 rounded-sm flex items-center gap-2" style={{
                    background: 'rgba(31,17,8,0.6)',
                    border: `1px solid ${item ? 'rgba(34,197,94,0.6)' : 'rgba(120,53,15,0.4)'}`,
                  }}>
                    <div className="w-8 h-8 flex items-center justify-center rounded-sm text-xl" style={{
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(120,53,15,0.4)',
                    }}>
                      {item ? item.icon : <span className="text-amber-700/40 text-xs italic">{i + 1}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-amber-700 italic uppercase tracking-wider">Slot {i + 1}</div>
                      <div className="text-xs text-amber-200 italic truncate">
                        {item ? `${item.name} ×${count}` : <span className="text-amber-700/60">— Empty —</span>}
                      </div>
                    </div>
                    {item && onUnequipPotion && (
                      <button
                        onClick={() => onUnequipPotion(i)}
                        className="text-[10px] text-amber-600 hover:text-amber-300 italic underline"
                        title="Clear quick-slot"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {tabItemCount === 0 ? (
            <div className="text-center py-12 px-6 rounded-sm relative" style={{
              background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.35) 0%, rgba(10, 6, 4, 0.9) 100%)',
              border: '2px dashed rgba(34, 197, 94, 0.4)',
            }}>
              <span className="text-3xl">🧪</span>
              <p className="text-amber-100/70 italic mb-1 mt-2">No potions or ingredients stowed.</p>
              <p className="text-xs text-amber-700 italic max-w-md mx-auto">
                Buy tonics at the Marketplace or harvest reagents in the dungeon, then brew at the bench.
              </p>
            </div>
          ) : (
            renderCategoryList(TAB_CATEGORIES.potions)
          )}
        </>
      )}

      {tab === 'spells' && (
        <>
          <SpellbookContent
            playerState={playerState}
            onEquipSpell={onEquipSpell}
            onUnequipSpell={onUnequipSpell}
          />
          {tabItemCount > 0 && renderCategoryList(TAB_CATEGORIES.spells)}
        </>
      )}

      <div className="text-center pt-2 flex flex-wrap justify-center gap-2">
        <button onClick={() => setScreen('shop')} className="px-4 py-2 rounded-sm text-xs italic border-2 border-amber-700 text-amber-300 hover:bg-amber-900/30 inline-flex items-center gap-2"
          style={{ background: 'rgba(41, 24, 12, 0.5)' }}>
          <ShoppingBag className="w-3.5 h-3.5" /> Browse the Marketplace
        </button>
        <button onClick={() => setScreen('crafting')} className="px-4 py-2 rounded-sm text-xs italic border-2 border-emerald-700 text-emerald-300 hover:bg-emerald-900/30 inline-flex items-center gap-2"
          style={{ background: 'rgba(6, 78, 59, 0.4)' }}>
          🌿 The Brewing Bench
        </button>
      </div>
    </div>
  );
}

export default InventoryScreen;
