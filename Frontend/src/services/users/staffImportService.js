import { apiRequest } from '../api/client'

const root = '/users/imports'

export const validateStaffCsv = (file, signal) => apiRequest(`${root}/validate`, {
  method: 'POST', body: file, headers: { 'Content-Type': 'text/csv' }, signal,
})

export const commitStaffCsv = (file, proof, key) => apiRequest(root, {
  method: 'POST', body: file,
  headers: { 'Content-Type': 'text/csv', 'X-Import-Proof': proof, 'Idempotency-Key': key },
})

export const fetchStaffImport = (id, signal) => apiRequest(`${root}/${encodeURIComponent(id)}`, { signal, silent: true })

export const fetchStaffImportByRequest = (key, signal) =>
  apiRequest(`${root}/by-request/${encodeURIComponent(key)}`, { signal, silent: true })
