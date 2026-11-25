import { useCallback, useEffect, useRef, useState } from 'react'

/** Query identity is explicit; inline loaders do not restart a request on every render. */
export function usePlatformResource(loader, dependencies = []) {
  const identity = JSON.stringify(dependencies)
  const loaderRef = useRef(loader)
  const [revision, setRevision] = useState(0)
  const [held, setHeld] = useState({ identity: null, revision: -1, data: null, error: null })

  useEffect(() => { loaderRef.current = loader }, [loader])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    Promise.resolve().then(() => {
      if (!active) return undefined
      return loaderRef.current(controller.signal)
    }).then((data) => {
      if (active) setHeld({ identity, revision, data, error: null })
    }).catch((error) => {
      if (active && error.name !== 'AbortError') setHeld((previous) => ({ identity, revision,
        data: previous.identity === identity ? previous.data : null, error }))
    })
    return () => { active = false; controller.abort() }
  }, [identity, revision])

  const reload = useCallback(() => setRevision((value) => value + 1), [])
  const current = held.identity === identity && held.revision === revision
  return { data: held.identity === identity ? held.data : null, error: current ? held.error : null, loading: !current, reload }
}

export default usePlatformResource
