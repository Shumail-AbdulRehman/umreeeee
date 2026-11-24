import { useCallback, useEffect, useRef, useState } from 'react'
import { getRedTeamTest } from '../services/redTeam/redTeamService'

const terminal = new Set(['completed', 'partially_failed', 'failed', 'cancelled'])
const POLL_MS = 2000
const MAX_BACKOFF_MS = 30000

// 'load' = nothing loaded yet for this id, 'poll' = a running status, 'idle' = draft or terminal.
function modeFor(testId, test) {
  if (!testId) return 'idle'
  if (!test) return 'load'
  return test.status === 'draft' || terminal.has(test.status) ? 'idle' : 'poll'
}

export default function useRedTeamTest(testId) {
  const [held, setHeld] = useState({ testId: null, test: null, error: '' })
  const idRef = useRef(testId)
  useEffect(() => { idRef.current = testId }, [testId])
  const matches = held.testId === testId
  const test = matches ? held.test : null
  const error = matches ? held.error : ''
  const mode = modeFor(testId, test)

  // Scheduler: re-runs when the id changes or the status moves between load, poll and idle.
  useEffect(() => {
    if (mode === 'idle') return undefined
    let alive = true
    let requestPending = false
    let failures = 0
    let timer
    async function tick() {
      if (!alive || requestPending) return
      clearTimeout(timer)
      if (document.hidden) return
      requestPending = true
      try {
        const response = await getRedTeamTest(testId)
        if (!alive) return
        failures = 0
        setHeld({ testId, test: response.test, error: '' })
        // Status transitions re-run this effect; a same-status poll reschedules here.
        if (modeFor(testId, response.test) === mode) timer = setTimeout(tick, POLL_MS)
      } catch (problem) {
        if (!alive) return
        failures += 1
        setHeld((prev) => ({ testId, test: prev.testId === testId ? prev.test : null, error: problem.message }))
        timer = setTimeout(tick, Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** failures))
      } finally {
        requestPending = false
      }
    }
    function onVisibility() { if (!document.hidden) void tick() }
    document.addEventListener('visibilitychange', onVisibility)
    if (mode === 'load') void tick()
    else timer = setTimeout(tick, POLL_MS)
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility) }
  }, [testId, mode])

  const setTest = useCallback((value) => {
    setHeld((prev) => {
      const current = prev.testId === idRef.current ? prev.test : null
      const next = typeof value === 'function' ? value(current) : value
      return { testId: idRef.current, test: next, error: '' }
    })
  }, [])

  const refresh = useCallback(async () => {
    const id = idRef.current
    if (!id) return null
    const response = await getRedTeamTest(id)
    if (idRef.current !== id) return null
    setHeld({ testId: id, test: response.test, error: '' })
    return response.test
  }, [])

  return { test, error, setTest, refresh }
}
