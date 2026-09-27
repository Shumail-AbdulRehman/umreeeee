import { useEffect, useState } from 'react'
import { getDashboardData } from '../services/dashboard/dashboardService'

export function useDashboardData({ enabled = true } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    let isMounted = true

    async function loadDashboard() {
      try {
        setLoading(true)
        const result = await getDashboardData()
        if (isMounted) {
          setData(result)
          setError(null)
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadDashboard()

    return () => {
      isMounted = false
    }
  }, [enabled])

  return {
    data: enabled ? data : null,
    loading: enabled ? loading : false,
    error: enabled ? error : null,
  }
}
