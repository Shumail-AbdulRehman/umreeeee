const listeners = new Set()
const activeRequests = new Set()

function emit() {
  for (const listener of listeners) listener()
}

export function subscribeRequestActivity(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getActiveRequestCount() {
  return activeRequests.size
}

export function beginTrackedRequest() {
  const request = Symbol('request')
  activeRequests.add(request)
  emit()
  return () => {
    if (activeRequests.delete(request)) emit()
  }
}
