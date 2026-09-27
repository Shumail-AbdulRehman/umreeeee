export const policyEntryId = (entry) => entry.pattern_id || entry.id
export const policyEntryName = (entry) => entry.name || entry.title || policyEntryId(entry)
