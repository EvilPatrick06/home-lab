// Re-export extracted functions so existing imports continue to work
export { buildCharacter5e } from './build-character-5e'
// `buildArmorFromEquipment5e` / `buildWeaponsFromEquipment5e` live in a leaf module
// (`build-from-equipment-5e`) that `build-character-5e` imports directly; re-exporting
// them here avoids a save-slice-5e ↔ build-character-5e import cycle while preserving
// the original `save-slice-5e` export surface.
export { buildArmorFromEquipment5e, buildWeaponsFromEquipment5e } from './build-from-equipment-5e'
export { loadCharacterForEdit5e } from './load-character-5e'
