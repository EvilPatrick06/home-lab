// Static file-path manifests for the index-less Round-3 loaders (companions,
// deities, planes). These directories have no `index.json`, so the loaders in
// `data-provider.ts` enumerate the files explicitly. Kept as plain string
// constants — they are passed to `loadJson()` (IPC), never to a raw browser
// fetch, so they do not trip the library-boundary data-fetch guard.

export const COMPANION_FILES = [
  './data/5e/character/companions/mounts/riding-horse-mount.json',
  './data/5e/character/companions/mounts/warhorse-mount.json',
  './data/5e/character/companions/mounts/pony-mount.json',
  './data/5e/character/companions/pets/owl-companion.json',
  './data/5e/character/companions/pets/hawk-companion.json',
  './data/5e/character/companions/pets/cat-companion.json',
  './data/5e/character/companions/hirelings/hireling-skilled.json',
  './data/5e/character/companions/hirelings/hireling-unskilled.json',
  './data/5e/character/companions/hirelings/hireling-mercenary.json'
]

export const DEITY_FILES = [
  './data/5e/world/deities/forgotten-realms/kelemvor.json',
  './data/5e/world/deities/forgotten-realms/lathander.json',
  './data/5e/world/deities/forgotten-realms/mystra.json',
  './data/5e/world/deities/forgotten-realms/selune.json',
  './data/5e/world/deities/forgotten-realms/sune.json',
  './data/5e/world/deities/forgotten-realms/tempus.json',
  './data/5e/world/deities/forgotten-realms/torm.json',
  './data/5e/world/deities/forgotten-realms/tyr.json',
  './data/5e/world/deities/pantheons/celtic.json',
  './data/5e/world/deities/pantheons/egyptian.json',
  './data/5e/world/deities/pantheons/greek.json',
  './data/5e/world/deities/pantheons/norse.json'
]

export const PLANE_FILES = [
  './data/5e/world/planes/material/material-plane.json',
  './data/5e/world/planes/inner/elemental-plane-of-air.json',
  './data/5e/world/planes/inner/elemental-plane-of-earth.json',
  './data/5e/world/planes/inner/elemental-plane-of-fire.json',
  './data/5e/world/planes/inner/elemental-plane-of-water.json',
  './data/5e/world/planes/transitive/astral-plane.json',
  './data/5e/world/planes/transitive/ethereal-plane.json',
  './data/5e/world/planes/transitive/feywild.json',
  './data/5e/world/planes/transitive/shadowfell.json',
  './data/5e/world/planes/outer/abyss.json',
  './data/5e/world/planes/outer/acheron.json',
  './data/5e/world/planes/outer/arborea.json',
  './data/5e/world/planes/outer/arcadia.json',
  './data/5e/world/planes/outer/beastlands.json',
  './data/5e/world/planes/outer/bytopia.json',
  './data/5e/world/planes/outer/carceri.json',
  './data/5e/world/planes/outer/elysium.json',
  './data/5e/world/planes/outer/gehenna.json',
  './data/5e/world/planes/outer/hades.json',
  './data/5e/world/planes/outer/limbo.json',
  './data/5e/world/planes/outer/mechanus.json',
  './data/5e/world/planes/outer/mount-celestia.json',
  './data/5e/world/planes/outer/nine-hells.json',
  './data/5e/world/planes/outer/outlands.json',
  './data/5e/world/planes/outer/pandemonium.json',
  './data/5e/world/planes/outer/ysgard.json',
  './data/5e/world/planes/other/demiplanes.json',
  './data/5e/world/planes/other/far-realm.json',
  './data/5e/world/planes/other/material-realms.json',
  './data/5e/world/planes/other/negative-plane.json',
  './data/5e/world/planes/other/para-elemental-planes.json',
  './data/5e/world/planes/other/planar-adventure-situations.json',
  './data/5e/world/planes/other/planar-adventuring.json',
  './data/5e/world/planes/other/planar-portals.json',
  './data/5e/world/planes/other/positive-plane.json',
  './data/5e/world/planes/other/sigil-city-of-doors.json',
  './data/5e/world/planes/other/spells.json',
  './data/5e/world/planes/other/the-blood-war.json',
  './data/5e/world/planes/other/the-great-wheel.json',
  './data/5e/world/planes/other/the-planes.json',
  './data/5e/world/planes/other/tour-of-the-multiverse.json',
  './data/5e/world/planes/other/traveling-the-outer-planes.json'
]
