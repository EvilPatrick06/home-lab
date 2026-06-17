export function normalizeNarrationText(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

export async function speakNarrationThroughBmo(
  text: string,
  opts: { npc?: string; emotion?: string; speaker?: string; interrupt?: boolean } = {}
): Promise<{ success: boolean; error?: string }> {
  const normalizedText = normalizeNarrationText(text)
  if (!normalizedText) {
    return { success: false, error: 'No narration text to speak' }
  }

  // PHASE-21 21B: single payload object (npc/emotion/speaker/interrupt).
  const result = await window.api.bmoNarrate({ text: normalizedText, ...opts })
  if (result?.ok === false || result?.error) {
    return { success: false, error: result.error || 'Failed to send narration to BMO' }
  }

  return { success: true }
}

// PHASE-21 21B (F7): barge-in — cancel any narration currently playing on the Pi.
export async function cancelNarrationThroughBmo(): Promise<{ success: boolean; error?: string }> {
  const result = await window.api.bmoNarrateCancel()
  if (result?.ok === false || result?.error) {
    return { success: false, error: result.error || 'Failed to cancel narration' }
  }
  return { success: true }
}
