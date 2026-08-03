// OWNER_IDS_ARR is pasted from wherever the ids were copied, so it arrives in whatever shape that
// tool produced: `a,b`, `['a','b']` or `["a","b"]`. Strip both quote characters and both brackets,
// not one flavour of quote - a surviving `"` makes each id compare as `"a"`, so isOwnerId is false
// forever and the owner-only UI (upload, delete) just never renders, with nothing logged anywhere.
export const getOwnerIds = (): string[] =>
  (process.env.OWNER_IDS_ARR ?? "")
    .replace(/[[\]'"`]/g, "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean)

export const isOwnerId = (userId?: string | null): boolean => !!userId && getOwnerIds().includes(userId)
