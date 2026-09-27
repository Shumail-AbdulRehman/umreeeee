import { useEffect, useState } from 'react'
import { getRedTeamTest } from '../services/redTeam/redTeamService'

const terminal = new Set(['completed', 'partially_failed', 'failed', 'cancelled'])

export default function useRedTeamTest(testId) {
  const [test, setTest] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!testId) { Promise.resolve().then(() => { setTest(null); setError('') }); return }
    let alive = true
    let failures = 0
    let timer
    async function load() {
      if (!alive || document.hidden) return
      try {
        const response = await getRedTeamTest(testId)
        if (!alive) return
        setTest(response.test); setError(''); failures = 0
        if (!terminal.has(response.test.status) && response.test.status !== 'draft') timer = setTimeout(load, 2000)
      } catch (problem) {
        if (!alive) return
        setError(problem.message)
        failures += 1
        timer = setTimeout(load, Math.min(30000, 2000 * 2 ** failures))
      }
    }
    function onVisibility() { if (!document.hidden) { clearTimeout(timer); void load() } }
    document.addEventListener('visibilitychange', onVisibility)
    void load()
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility) }
  }, [testId])
  return { test, error, setTest, refresh: async () => { if (testId) setTest((await getRedTeamTest(testId)).test) } }
}
