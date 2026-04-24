import type { AttackResult } from './attack-types'

export function formatAttackResult(result: AttackResult): string {
  const lines: string[] = []

  // Header
  const critTag = result.isCrit ? ' **CRITICAL HIT!**' : ''
  const fumbleTag = result.isFumble ? ' *Natural 1 — Miss!*' : ''
  const hitMiss = result.isHit ? 'HIT' : 'MISS'

  lines.push(`**${result.attackerName}** attacks **${result.targetName}** with **${result.weaponName}**`)

  // Roll info
  const rollModeTag = result.rollMode === 'advantage' ? ' (Adv)' : result.rollMode === 'disadvantage' ? ' (Dis)' : ''
  lines.push(
    `Attack: [${result.attackRoll}]${rollModeTag} + ${result.attackTotal - result.attackRoll} = **${result.attackTotal}** vs AC ${result.targetAC} — **${hitMiss}**${critTag}${fumbleTag}`
  )

  // Cover info
  if (result.coverType !== 'none') {
    lines.push(`Cover: ${result.coverType} (+${result.coverACBonus} AC)`)
  }

  // Damage
  if (result.isHit || (result.masteryEffect?.grazeDamage !== undefined && result.damageTotal > 0)) {
    const finalDmg = result.damageResolution?.totalFinalDamage ?? result.damageTotal
    const dmgDetail = result.damageRolls.length > 0 ? ` [${result.damageRolls.join(', ')}]` : ''
    lines.push(`Damage: **${finalDmg}** ${result.damageType}${dmgDetail}`)

    // Extra damage from effects
    for (const extra of result.extraDamage) {
      lines.push(`  + ${extra.total} ${extra.damageType} [${extra.rolls.join(', ')}]`)
    }

    // Resistance/immunity/vulnerability notes
    if (result.damageResolution) {
      for (const r of result.damageResolution.results) {
        if (r.reason) {
          lines.push(`  (${r.reason})`)
        }
      }
    }
  }

  // Weapon mastery
  if (result.masteryEffect) {
    lines.push(`Mastery (${result.masteryEffect.mastery}): ${result.masteryEffect.description}`)
  }

  // Advantage/disadvantage sources
  if (result.advantageSources.length > 0) {
    lines.push(`Advantage: ${result.advantageSources.join(', ')}`)
  }
  if (result.disadvantageSources.length > 0) {
    lines.push(`Disadvantage: ${result.disadvantageSources.join(', ')}`)
  }

  return lines.join('\n')
}
