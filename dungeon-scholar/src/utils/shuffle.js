// Generic Fisher-Yates shuffle. Pass a deterministic rng (0<=rng()<1) for
// reproducible output; defaults to Math.random. Shared home (S22) for the
// shuffle helpers that were re-implemented across modules. NOTE: the
// sin-seeded shuffles in game/items.js (pickShopStock) and the map-gen RNG in
// components/DungeonExplore.jsx intentionally keep their own seeded algorithms
// so their persisted/deterministic output is unchanged.
export const shuffle = (arr, rng = Math.random) => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
