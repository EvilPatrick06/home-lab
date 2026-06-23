import { describe, it, expect } from 'vitest';
import { sanctumCount, sanctumAtCap, findItem, pickShopStock } from './items.js';

describe('sanctumCount / sanctumAtCap', () => {
  it('counts step-aware stacks for sanctum items', () => {
    const coin = findItem('lucky_coin'); // permKey goldDropPct, step 5, cap 4
    expect(sanctumCount({ permUpgrades: { goldDropPct: 10 } }, coin)).toBe(2);
    expect(sanctumAtCap({ permUpgrades: { goldDropPct: 10 } }, coin)).toBe(false);
    expect(sanctumAtCap({ permUpgrades: { goldDropPct: 20 } }, coin)).toBe(true);
  });

  it('returns 0 for items without a permKey (e.g. apothecary)', () => {
    const tonic = findItem('minor_heal_tonic');
    expect(sanctumCount({ permUpgrades: {} }, tonic)).toBe(0);
    expect(sanctumAtCap({ permUpgrades: {} }, tonic)).toBe(false);
  });

  it('counts devotion and celestial permKey items (I7 fix)', () => {
    const relic = findItem('relic_mana_pearl'); // devotion, permKey maxManaBonus, cap 3
    expect(sanctumCount({ permUpgrades: { maxManaBonus: 2 } }, relic)).toBe(2);
    const revive = findItem('celestial_revive'); // celestial, permKey ascAutoRevive, cap 1
    expect(sanctumCount({ permUpgrades: { ascAutoRevive: 1 } }, revive)).toBe(1);
    expect(sanctumAtCap({ permUpgrades: { ascAutoRevive: 1 } }, revive)).toBe(true);
  });

  it('treats missing permUpgrades as zero', () => {
    expect(sanctumCount({}, findItem('lucky_coin'))).toBe(0);
  });
});

describe('findItem', () => {
  it('finds a known item by id', () => {
    expect(findItem('minor_heal_tonic')).toMatchObject({ id: 'minor_heal_tonic' });
  });
  it('returns undefined for an unknown id', () => {
    expect(findItem('does_not_exist')).toBeUndefined();
  });
});

describe('pickShopStock', () => {
  it('is deterministic for the same date + category', () => {
    const a = pickShopStock('2026-06-22', 'sanctum');
    const b = pickShopStock('2026-06-22', 'sanctum');
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
  });
  it('only returns items from the requested category', () => {
    const stock = pickShopStock('2026-06-22', 'apothecary', 4);
    expect(stock.length).toBeGreaterThan(0);
    expect(stock.every((i) => i.category === 'apothecary')).toBe(true);
  });
  it('caps the count at n', () => {
    expect(pickShopStock('2026-06-22', 'sanctum', 2)).toHaveLength(2);
  });
  it('returns an empty array for an unknown category', () => {
    expect(pickShopStock('2026-06-22', 'no_such_category')).toEqual([]);
  });
});
