import { describe, expect, it } from 'vitest';
import { BIOMES, TILE } from '../../game/dungeonMap.js';
import {
  BOSS_DISPLAY,
  BOSS_DRAWERS,
  DECO_DRAWERS,
  drawChest,
  drawPlayer,
  drawTile,
  drawWeapon,
  MOB_DRAWERS,
  TILE_PX,
} from './tileRenderer.js';

// Minimal CanvasRenderingContext2D stand-in. Every method is a recording no-op;
// the gradient factories return an object with addColorStop so chained
// .addColorStop() calls don't throw. Property writes (fillStyle, lineWidth, …)
// are stored so any read-back returns what was set.
function makeCtx() {
  const calls = {};
  const gradient = { addColorStop: () => {} };
  return new Proxy(
    { __calls: calls, canvas: { width: 1000, height: 1000 } },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') {
          return () => gradient;
        }
        if (prop === 'measureText') return () => ({ width: 0 });
        if (prop === 'getImageData') return () => ({ data: [] });
        return (...args) => {
          calls[prop] = (calls[prop] || 0) + 1;
          void args;
        };
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    },
  );
}

const firstBiome = Object.values(BIOMES)[0];

describe('TILE_PX', () => {
  it('is the 48px shared tile size', () => {
    expect(TILE_PX).toBe(48);
  });
});

describe('drawer lookup tables', () => {
  it('expose only function values', () => {
    for (const table of [DECO_DRAWERS, MOB_DRAWERS, BOSS_DRAWERS]) {
      expect(Object.keys(table).length).toBeGreaterThan(0);
      for (const fn of Object.values(table)) expect(typeof fn).toBe('function');
    }
  });

  it('keep BOSS_DISPLAY in sync with BOSS_DRAWERS (name + icon per boss)', () => {
    expect(Object.keys(BOSS_DISPLAY).sort()).toEqual(Object.keys(BOSS_DRAWERS).sort());
    for (const meta of Object.values(BOSS_DISPLAY)) {
      expect(typeof meta.name).toBe('string');
      expect(typeof meta.icon).toBe('string');
    }
  });
});

describe('drawTile', () => {
  const map = [
    [TILE.WALL, TILE.WALL, TILE.WALL],
    [TILE.WALL, TILE.FLOOR, TILE.WALL],
    [TILE.WALL, TILE.WALL, TILE.WALL],
  ];

  it('renders every tile type without throwing and paints to the context', () => {
    for (const type of Object.values(TILE)) {
      const ctx = makeCtx();
      expect(() => drawTile(ctx, firstBiome, type, 0, 0, 1, 1, map)).not.toThrow();
      expect(ctx.__calls.fillRect || 0).toBeGreaterThan(0);
    }
  });

  it('handles a missing map (no neighbor data) for a floor tile', () => {
    const ctx = makeCtx();
    expect(() => drawTile(ctx, firstBiome, TILE.FLOOR, 48, 48, 0, 0, null)).not.toThrow();
  });

  it('renders floor tiles across every biome palette', () => {
    for (const biome of Object.values(BIOMES)) {
      const ctx = makeCtx();
      expect(() => drawTile(ctx, biome, TILE.FLOOR, 0, 0, 2, 3, map)).not.toThrow();
    }
  });
});

describe('decoration / mob / boss sprites', () => {
  it('invoke every drawer without throwing', () => {
    for (const table of [DECO_DRAWERS, MOB_DRAWERS, BOSS_DRAWERS]) {
      for (const fn of Object.values(table)) {
        const ctx = makeCtx();
        expect(() => fn(ctx, 0, 0, 0.5)).not.toThrow();
      }
    }
  });
});

describe('drawChest', () => {
  it('renders each tier, opened and closed', () => {
    for (const tier of ['wooden', 'silver', 'gold']) {
      for (const opened of [false, true]) {
        const ctx = makeCtx();
        expect(() => drawChest(ctx, tier, 0, 0, opened, 0.3)).not.toThrow();
      }
    }
  });
});

describe('drawPlayer', () => {
  it('renders each facing direction', () => {
    for (const facing of ['up', 'down', 'left', 'right']) {
      const ctx = makeCtx();
      expect(() => drawPlayer(ctx, 0, 0, facing, 0, {}, 0)).not.toThrow();
    }
  });

  it('renders with equipped cosmetics', () => {
    const ctx = makeCtx();
    expect(() => drawPlayer(ctx, 0, 0, 'down', 1, { cloak: 'starbound_cloak' }, 0.5)).not.toThrow();
  });
});

describe('drawWeapon', () => {
  it('is a no-op for a falsy weapon id', () => {
    const ctx = makeCtx();
    drawWeapon(ctx, null, 24, 24, 'right', 0);
    expect(ctx.__calls.fillRect || 0).toBe(0);
  });

  it('renders a known weapon with a mid-swing arc', () => {
    const ctx = makeCtx();
    expect(() => drawWeapon(ctx, 'oaken_blade', 24, 24, 'left', 0.5)).not.toThrow();
  });
});
