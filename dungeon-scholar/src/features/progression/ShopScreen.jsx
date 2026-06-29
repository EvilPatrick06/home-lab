import { Check, Coins, Lock, ShoppingBag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ITEM_CATEGORIES, pickShopStock, sanctumAtCap, sanctumCount } from '../../game/items.js';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';
import { todayDateStr } from '../../services/devotion.js';

function ShopScreen({ playerState, setScreen, onPurchase }) {
  const [activeTab, setActiveTab] = useState('apothecary');
  const [pendingPurchase, setPendingPurchase] = useState(null); // item object
  // 19A: inline overlay — hook armed only while a purchase confirm is rendered.
  const purchaseConfirmRef = useDialogA11y({ onClose: () => setPendingPurchase(null), active: !!pendingPurchase });
  const [purchaseError, setPurchaseError] = useState(null);

  // Daily-rotating stock — recomputes when the date string changes (refreshes
  // at midnight). Memoized so revisits within the same day reuse the picks.
  const today = todayDateStr();
  const stockByCategory = useMemo(() => {
    const out = {};
    Object.keys(ITEM_CATEGORIES).forEach((catId) => {
      out[catId] = pickShopStock(today, catId, 4);
    });
    return out;
  }, [today]);

  const tabs = Object.entries(ITEM_CATEGORIES).map(([id, cat]) => ({ id, ...cat }));
  const currentCat = ITEM_CATEGORIES[activeTab];
  const currentStock = stockByCategory[activeTab] || [];

  const isOwned = (item) => {
    if (!item.oneTime) return false;
    return (playerState.inventory?.[item.id] || 0) > 0;
  };
  const sanctumLevel = (item) => sanctumCount(playerState, item);
  const sanctumCap = (item) => item.cap || 1;

  const tryBuy = () => {
    if (!pendingPurchase) return;
    const result = onPurchase(pendingPurchase.id);
    if (result.ok) {
      setPendingPurchase(null);
      setPurchaseError(null);
    } else {
      setPurchaseError(result.reason);
    }
  };

  return (
    <div className="space-y-6">
      <div
        className="p-6 rounded-sm relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-amber-strong, 120, 53, 15), 0.5) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
          border: '3px double rgba(245, 158, 11, 0.6)',
          boxShadow: '0 0 30px rgba(245, 158, 11, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
        }}
      >
        <div className="absolute top-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-amber-500 text-sm">⚜</div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <ShoppingBag
              className="w-10 h-10 text-amber-300"
              style={{ filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.6))' }}
            />
            <div>
              <h2
                className="text-2xl font-bold text-amber-200 italic"
                style={{ textShadow: '0 0 12px rgba(245, 158, 11, 0.4)' }}
              >
                The Marketplace
              </h2>
              <div className="text-xs text-amber-400 tracking-[0.2em] italic">⚜ ROTATING WARES — {today} ⚜</div>
              <div className="text-xs text-amber-100/70 italic mt-1">Stock changes at the breaking of each dawn.</div>
            </div>
          </div>
          <div
            className="px-4 py-2 rounded-sm border-2 border-amber-700/60 flex items-center gap-2"
            style={{
              background:
                'linear-gradient(to bottom, rgba(var(--surface-amber-strong, 120, 53, 15), 0.5), rgba(var(--surface-amber, 41, 24, 12), 0.85))',
              boxShadow: '0 0 10px rgba(245, 158, 11, 0.2), inset 0 0 10px rgba(0,0,0,0.4)',
            }}
          >
            <Coins
              className="w-5 h-5 text-amber-300"
              style={{ filter: 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.6))' }}
            />
            <span className="text-amber-200 font-bold italic text-lg tabular-nums">{playerState.gold || 0}</span>
            <span className="text-amber-700 italic text-xs">gold</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="px-4 py-2.5 rounded-sm font-bold italic text-sm border-2 flex items-center gap-2 transition"
            style={{
              borderColor: activeTab === t.id ? 'rgba(245, 158, 11, 0.85)' : 'rgba(126, 34, 206, 0.5)',
              background:
                activeTab === t.id
                  ? 'linear-gradient(to bottom, rgba(var(--surface-amber-strong, 120, 53, 15), 0.6), rgba(var(--surface-amber, 41, 24, 12), 0.95))'
                  : 'rgba(var(--surface-purple, 31, 12, 41), 0.5)',
              color: activeTab === t.id ? '#fde047' : '#d8b4fe',
              boxShadow: activeTab === t.id ? '0 0 15px rgba(245, 158, 11, 0.35)' : 'none',
            }}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-amber-100/70 italic text-sm">{currentCat.blurb}</p>

      {currentStock.length === 0 ? (
        <div className="text-center py-12 text-amber-700 italic">The shelves are bare in this hall today.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {currentStock.map((item) => {
            const owned = isOwned(item);
            const usesDevotion = item.category === 'devotion' && typeof item.devotionPrice === 'number';
            const usesTokens = item.category === 'celestial' && typeof item.ascensionPrice === 'number';
            const atCap =
              (item.category === 'sanctum' || item.category === 'devotion' || item.category === 'celestial') &&
              sanctumAtCap(playerState, item);
            const canAfford = usesDevotion
              ? (playerState.devotion || 0) >= item.devotionPrice
              : usesTokens
                ? (playerState.ascensionTokens || 0) >= item.ascensionPrice
                : (playerState.gold || 0) >= item.price;
            const locked = item.locked;
            const disabled = owned || atCap || locked || !canAfford;
            const buttonLabel = locked
              ? 'Sealed'
              : owned
                ? 'Owned'
                : atCap
                  ? `Maxed (${sanctumLevel(item)}/${sanctumCap(item)})`
                  : !canAfford
                    ? usesDevotion
                      ? 'Insufficient devotion'
                      : usesTokens
                        ? 'Insufficient tokens'
                        : 'Insufficient gold'
                    : 'Purchase';
            return (
              <div
                key={item.id}
                className="p-5 rounded-sm relative"
                style={{
                  background: locked
                    ? 'linear-gradient(135deg, rgba(15, 8, 20, 0.6) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)'
                    : owned || atCap
                      ? 'linear-gradient(135deg, rgba(var(--surface-emerald, 6, 78, 59), 0.4) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.9) 100%)'
                      : 'linear-gradient(135deg, rgba(var(--surface-purple, 31, 12, 41), 0.7) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
                  border: locked
                    ? '1px solid rgba(60, 35, 80, 0.4)'
                    : owned || atCap
                      ? '2px solid rgba(16, 185, 129, 0.6)'
                      : '2px solid rgba(126, 34, 206, 0.5)',
                  boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
                }}
              >
                <div className="absolute top-1 left-1 text-amber-700/60 text-xs">⚜</div>
                <div className="absolute top-1 right-1 text-amber-700/60 text-xs">⚜</div>
                <div className="absolute bottom-1 left-1 text-amber-700/60 text-xs">⚜</div>
                <div className="absolute bottom-1 right-1 text-amber-700/60 text-xs">⚜</div>

                <div className="flex items-start gap-3 mb-3">
                  <div className="text-3xl shrink-0">{item.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <h3
                        className={`font-bold italic text-sm ${locked ? 'text-amber-700/70' : 'text-amber-200'}`}
                        style={!locked ? { textShadow: '0 0 6px rgba(245, 158, 11, 0.3)' } : undefined}
                      >
                        {item.name}
                      </h3>
                      {(item.category === 'sanctum' || item.category === 'devotion') && item.permKey && (
                        <span className="text-xs text-emerald-300 italic">
                          {sanctumLevel(item)}/{sanctumCap(item)}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs italic mt-1 ${locked ? 'text-amber-700/50' : 'text-amber-100/70'}`}>
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs italic flex items-center gap-1">
                    {usesDevotion ? (
                      <>
                        <span className="text-purple-300">✦</span>
                        <span className={`font-bold tabular-nums ${canAfford ? 'text-purple-200' : 'text-red-300'}`}>
                          {item.devotionPrice}
                        </span>
                        <span className="text-purple-400">devotion</span>
                      </>
                    ) : usesTokens ? (
                      <>
                        <span className="text-amber-300">🌟</span>
                        <span className={`font-bold tabular-nums ${canAfford ? 'text-amber-200' : 'text-red-300'}`}>
                          {item.ascensionPrice}
                        </span>
                        <span className="text-amber-400">{item.ascensionPrice === 1 ? 'token' : 'tokens'}</span>
                      </>
                    ) : (
                      <>
                        <Coins className="w-4 h-4 text-amber-300" />
                        <span className={`font-bold tabular-nums ${canAfford ? 'text-amber-300' : 'text-red-300'}`}>
                          {item.price}
                        </span>
                        <span className="text-amber-700">gold</span>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (!disabled) {
                        setPendingPurchase(item);
                        setPurchaseError(null);
                      }
                    }}
                    disabled={disabled}
                    className="px-3 py-1.5 rounded-sm text-xs font-bold italic border-2 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={
                      disabled
                        ? {
                            background: 'rgba(var(--surface-purple, 31, 12, 41), 0.6)',
                            borderColor: 'rgba(126, 34, 206, 0.4)',
                            color: '#a78bfa',
                          }
                        : {
                            background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                            borderColor: '#fde047',
                            color: '#451a03',
                            boxShadow: '0 0 12px rgba(245, 158, 11, 0.5)',
                          }
                    }
                  >
                    {locked ? (
                      <Lock className="w-3 h-3" />
                    ) : owned || atCap ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Coins className="w-3 h-3" />
                    )}
                    {buttonLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pendingPurchase && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            ref={purchaseConfirmRef}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm purchase"
            className="rounded-sm max-w-md w-full overflow-hidden flex flex-col relative"
            style={{
              background:
                'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.99) 0%, rgba(var(--surface-deep, 10, 6, 4), 1) 100%)',
              border: '3px double rgba(245, 158, 11, 0.7)',
              boxShadow: '0 0 60px rgba(245, 158, 11, 0.4)',
            }}
          >
            <div className="absolute top-2 left-2 text-amber-500 text-lg">⚜</div>
            <div className="absolute top-2 right-2 text-amber-500 text-lg">⚜</div>
            <div className="absolute bottom-2 left-2 text-amber-500 text-lg">⚜</div>
            <div className="absolute bottom-2 right-2 text-amber-500 text-lg">⚜</div>

            <div className="p-6 space-y-4 text-center">
              <div className="text-5xl">{pendingPurchase.icon}</div>
              <div>
                <h3
                  className="text-xl font-bold text-amber-200 italic"
                  style={{ textShadow: '0 0 8px rgba(245, 158, 11, 0.4)' }}
                >
                  Purchase {pendingPurchase.name}?
                </h3>
                <p className="text-sm text-amber-100/80 italic mt-2">{pendingPurchase.description}</p>
              </div>
              <div
                className="px-4 py-3 rounded-sm border border-amber-700/60 inline-flex items-center gap-2"
                style={{ background: 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.4)' }}
              >
                <span className="text-xs text-amber-700 italic">Cost:</span>
                <Coins className="w-4 h-4 text-amber-300" />
                <span className="text-amber-200 font-bold italic tabular-nums">{pendingPurchase.price}</span>
                <span className="text-xs text-amber-700 italic">gold</span>
              </div>
              <div className="text-xs text-amber-100/60 italic">
                Thou hast <span className="text-amber-300 font-bold">{playerState.gold || 0}</span> gold.
              </div>
              {purchaseError && (
                <div
                  className="px-3 py-2 rounded-sm text-sm italic border border-red-500/60 text-red-200"
                  style={{ background: 'rgba(127, 29, 29, 0.4)' }}
                >
                  {purchaseError}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-amber-700/50 flex gap-2">
              <button
                onClick={() => {
                  setPendingPurchase(null);
                  setPurchaseError(null);
                }}
                className="flex-1 py-3 rounded-sm border-2 border-amber-700 text-amber-200 italic"
                style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
              >
                Cancel
              </button>
              <button
                onClick={tryBuy}
                className="flex-1 py-3 font-bold rounded-sm flex items-center justify-center gap-2 text-amber-950 border-2 border-amber-300 italic"
                style={{
                  background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                  boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)',
                }}
              >
                <Coins className="w-4 h-4" /> Confirm Purchase
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ShopScreen;
