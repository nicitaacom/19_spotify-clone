export const getOwnerIds = (): string[] =>
  (process.env.OWNER_IDS_ARR ?? "")
    .replace(/[[\]']/g, "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean)

export const isOwnerId = (userId?: string | null): boolean => !!userId && getOwnerIds().includes(userId)
