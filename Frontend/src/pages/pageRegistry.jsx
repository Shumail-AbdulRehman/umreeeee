import { lazy } from 'react'
const PoliciesPage = lazy(() => import('./PoliciesPage'))
export const pageRegistry = {
  insights: lazy(() => import('./InsightsPage')),
  integrations: lazy(() => import('./IntegrationsPage')),
  inventory: lazy(() => import('./InventoryPage')),
  policies: PoliciesPage,
  'dlp-policy': lazy(() => import('./PoliciesPage').then((module) => ({ default: module.DlpPolicyPage }))),
  'guardrail-policy': lazy(() => import('./PoliciesPage').then((module) => ({ default: module.GuardrailPolicyPage }))),
  'prompt-studio': lazy(() => import('./PromptStudioPage')),
  violations: lazy(() => import('./ViolationsPage')),
  'user-insights': lazy(() => import('./UserInsightsPage')),
  'my-activity': lazy(() => import('./MyActivityPage')),
  users: lazy(() => import('./UsersPage')),
  'activity-log': lazy(() => import('./ActivityLogPage')),
  catalog: lazy(() => import('./CatalogPage')),
  latency: lazy(() => import('./LatencyPage')),
  spend: lazy(() => import('./SpendPage')),
  settings: lazy(() => import('./SettingsPage')),
  'red-team': lazy(() => import('./RedTeamPage')),
}
