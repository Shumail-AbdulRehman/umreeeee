import { apiRequest } from '../api/client'

export async function getDashboardData() {
  return apiRequest('/dashboard')
}
