import { addToast } from '../hooks/use-toast'

export async function copyToClipboard(text: string, successMessage?: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    if (successMessage) addToast(successMessage, 'success')
    return true
  } catch {
    // Fallback for contexts where navigator.clipboard isn't available
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      if (successMessage) addToast(successMessage, 'success')
      return true
    } catch {
      addToast('Failed to copy to clipboard', 'error')
      return false
    }
  }
}
