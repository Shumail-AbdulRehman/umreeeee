const sampleResponseMarkdown = "Here’s a simple release plan, organized around **three clear milestones**.\n\n## Prepare, build, review\n\n1. **Prepare the scope.** Agree on the tasks and what “done” means.\n2. **Build the essentials.** Complete the agreed work before adding extras.\n3. **Review together.** Check the result, note any gaps, and choose the next step.\n\n## At a glance\n\n| Milestone | Focus | Output |\n| --- | --- | --- |\n| Prepare | Align the team | Agreed scope |\n| Build | Complete the essentials | Reviewable work |\n| Review | Check the outcome | Next steps |\n\n> Keep the plan small enough to review before starting the next milestone.\n\n## A small example\n\nA task can track its milestone with a simple `status` field:\n\n```json\n{\n  \"task\": \"Review the release\",\n  \"status\": \"ready\"\n}\n```\n\nUse the checklist below during the review:\n\n- [x] Scope agreed\n- [ ] Review complete\n"
// Prototype only. All content is synthetic; this file never calls an API.
const drawer = document.querySelector('.history-dialog')
const trigger = document.querySelector('[data-open-history]')
trigger?.addEventListener('click', event => { drawer.dataset.input = event.detail ? 'pointer' : 'keyboard'; drawer.showModal() })
drawer?.querySelector('[data-close-history]')?.addEventListener('click', event => { drawer.dataset.input = event.detail ? 'pointer' : 'keyboard'; drawer.close() })
drawer?.addEventListener('cancel', () => { drawer.dataset.input = 'keyboard' })
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
  try { await navigator.clipboard.writeText(text); feedback.textContent = 'Copied' }
  catch { feedback.textContent = 'Copy is unavailable in this preview. Select the text to copy it.' }
}
document.querySelector('[data-copy-code]')?.addEventListener('click', event => copyText(event.currentTarget, document.querySelector('.code-block pre').textContent))
document.querySelector('[data-copy-response]')?.addEventListener('click', event => copyText(event.currentTarget, sampleResponseMarkdown))
