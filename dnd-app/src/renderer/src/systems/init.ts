import { dnd5ePlugin } from './dnd5e'
import { getAllSystems, registerSystem, unregisterSystem } from './registry'

export { getAllSystems, unregisterSystem }

export function initGameSystems(): void {
  registerSystem(dnd5ePlugin)
}
