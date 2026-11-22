/** Write the supplied literal text, letting the caller present browser failures. */
export async function copyText(text) {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
    throw new Error('Clipboard access is unavailable')
  }

  await navigator.clipboard.writeText(text)
}
