import { pathToFileURL } from 'node:url'

export async function checkConversationApi(apiBase, fetchApi = fetch) {
  const url = new URL(apiBase)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname.replace(/\/+$/, '') !== '/api' || url.search || url.hash) {
    throw new Error('Use the public backend URL ending in /api, without credentials or query parameters.')
  }
  const schemaUrl = new URL('/openapi.json', url)
  let schema
  try {
    const response = await fetchApi(schemaUrl, { signal: AbortSignal.timeout(15000), redirect: 'error' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    schema = await response.json()
  } catch {
    throw new Error(`Cannot verify the backend at ${url.origin}. Confirm it is deployed and /openapi.json is reachable, then rebuild.`)
  }
  const paths = schema.paths || {}
  const required = ['/api/prompt-workspace/conversations', '/api/prompt-workspace/conversations/{conversation_id}']
  if (required.some((path) => !paths[path]?.get)) {
    throw new Error(`The backend at ${url.origin} does not support chat history. Deploy the updated backend before deploying this frontend.`)
  }
  let request = paths['/api/prompt-workspace/run']?.post?.requestBody?.content?.['application/json']?.schema
  if (request?.$ref?.startsWith('#/')) {
    request = request.$ref.slice(2).split('/').reduce((value, key) =>
      value?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], schema)
  }
  if (!request?.properties?.conversation_id) {
    throw new Error(`The backend at ${url.origin} cannot save follow-up messages in a chat. Deploy the complete backend update, then rebuild.`)
  }
  return { origin: url.origin, conversationHistory: true }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await checkConversationApi(process.argv[2] || process.env.VITE_API_BASE_URL)
    console.log(`Conversation API verified at ${result.origin}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
