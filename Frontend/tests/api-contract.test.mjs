import test from 'node:test'
import assert from 'node:assert/strict'
import { checkConversationApi } from '../scripts/check-api-contract.mjs'

const valid = () => ({ paths: {
  '/api/prompt-workspace/conversations': { get: {} },
  '/api/prompt-workspace/conversations/{conversation_id}': { get: {} },
  '/api/prompt-workspace/run': { post: { requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Prompt' } } } } } },
}, components: { schemas: { Prompt: { properties: { conversation_id: {} } } } } })
const response = (body) => async () => ({ ok: true, json: async () => body })
test('current backend supports conversation history and follow-ups', async () => {
  assert.equal((await checkConversationApi('https://api.example.test/api', response(valid()))).conversationHistory, true)
})
test('old deployed backend is rejected before publishing the frontend', async () => {
  await assert.rejects(checkConversationApi('https://api.example.test/api', response({ paths: {} })), /Deploy the updated backend/)
})
test('partial backend missing follow-up schema is rejected', async () => {
  const schema = valid(); delete schema.components.schemas.Prompt.properties.conversation_id
  await assert.rejects(checkConversationApi('https://api.example.test/api', response(schema)), /complete backend update/)
})
test('network failure yields an actionable check error', async () => {
  await assert.rejects(checkConversationApi('https://api.example.test/api', async () => { throw new Error('offline') }), /Cannot verify the backend/)
})
test('credentials and invalid API path are rejected without fetching', async () => {
  await assert.rejects(checkConversationApi('https://user:secret@api.example.test/api', response(valid())), /without credentials/)
  await assert.rejects(checkConversationApi('https://api.example.test/', response(valid())), /ending in \/api/)
})
