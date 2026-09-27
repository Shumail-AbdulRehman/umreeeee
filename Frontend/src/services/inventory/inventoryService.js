const STORAGE_KEY = 'centurion.inventory.groups'
const LEGACY_SEED_GROUP_IDS = new Set([
  'grp-1',
  'grp-2',
  'grp-3',
  'grp-4',
  'grp-5',
  'grp-6',
  'grp-7',
  'grp-8',
  'grp-9',
  'grp-10',
  'grp-11',
  'grp-12',
])

export const dlpPolicyOptions = [
  'All dlps',
  'All bulk dlps',
  'Restricted PII',
  'Finance Only',
  'Public Safe',
]

export const guardrailsPolicyOptions = [
  'testing-policy',
  'test-policy2',
  'PII Shield',
  'Prompt Guard',
  'Compliance Net',
]

function safeParse(rawValue) {
  try {
    const parsed = JSON.parse(rawValue)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function stripLegacySeedGroups(groups) {
  return groups.filter((group) => !LEGACY_SEED_GROUP_IDS.has(group?.id))
}

export function loadInventoryGroups() {
  const rawValue = window.localStorage.getItem(STORAGE_KEY)
  if (!rawValue) {
    return []
  }

  const parsedGroups = safeParse(rawValue)
  const groups = stripLegacySeedGroups(parsedGroups)

  if (groups.length !== parsedGroups.length) {
    persistInventoryGroups(groups)
  }

  return groups
}

export function persistInventoryGroups(groups) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
}

export function createInventoryGroup(formData) {
  return {
    id: `grp-${crypto.randomUUID()}`,
    name: formData.name.trim(),
    dlpPolicy: formData.dlpPolicy,
    guardrailsPolicy: formData.guardrailsPolicy,
    description: formData.description.trim(),
    createdAt: new Date().toISOString(),
  }
}

export function updateInventoryGroup(groups, groupId, nextGroup) {
  return groups.map((group) => (group.id === groupId ? { ...group, ...nextGroup } : group))
}

export function deleteInventoryGroup(groups, groupId) {
  return groups.filter((group) => group.id !== groupId)
}

export function groupsToCsv(groups) {
  const rows = [
    ['Name', 'Policy', 'Guardrails Policy', 'Description'],
    ...groups.map((group) => [
      group.name,
      group.dlpPolicy || '--',
      group.guardrailsPolicy || '--',
      group.description || '--',
    ]),
  ]

  return rows
    .map((row) =>
      row
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(','),
    )
    .join('\n')
}
