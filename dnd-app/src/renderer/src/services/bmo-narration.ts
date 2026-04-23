export function normalizeNarrationText(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

export async function speakNarrationThroughBmo(
  text: string,
  npc?: string,
  emotion?: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedText = normalizeNarrationText(text)
  if (!normalizedText) {
    return { success: false, error: 'No narration text to speak' }
  }

  const result = await window.api.bmoNarrate(normalizedText, npc, emotion)
  if (result?.ok === false || result?.error) {
    return { success: false, error: result.error || 'Failed to send narration to BMO' }
  }

  return { success: true }
}
