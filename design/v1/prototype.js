// Prototype only. All content is synthetic; this file never calls an API.
const drawer = document.querySelector('.history-dialog')
const trigger = document.querySelector('[data-open-history]')
trigger?.addEventListener('click', () => drawer.showModal())
drawer?.querySelector('[data-close-history]')?.addEventListener('click', () => drawer.close())
drawer?.addEventListener('click', event => { if (event.target === drawer && event.clientX < drawer.getBoundingClientRect().left) drawer.close() })
drawer?.addEventListener('close', () => trigger?.focus())
const input = document.querySelector('#message')
const send = document.querySelector('.send-button')
input?.addEventListener('input', () => { send.disabled = !input.value.trim() })
document.querySelector('.composer')?.addEventListener('submit', event => {
  event.preventDefault()
  document.querySelector('.demo-status').textContent = 'Design preview only. No message was sent.'
})
async function copyText(button, text) {
  const feedback = document.querySelector('.response-copy-status')
  try { await navigator.clipboard.writeText(text); feedback.textContent = 'Copied'; button.setAttribute('aria-label', 'Copied to clipboard') }
  catch { feedback.textContent = 'Copy is unavailable in this preview. Select the text to copy it.' }
}
document.querySelector('[data-copy-code]')?.addEventListener('click', event => copyText(event.currentTarget, document.querySelector('.code-block pre').textContent))
document.querySelector('[data-copy-response]')?.addEventListener('click', event => copyText(event.currentTarget, document.querySelector('.markdown').innerText))
