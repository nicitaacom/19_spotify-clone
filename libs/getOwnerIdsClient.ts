export const getOwnerIdsClient = (): string[] =>
  (process.env.NEXT_PUBLIC_OWNER_IDS_ARR ?? "")
    .replace(/[[\]']/g, "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean)

export const isOwnerIdClient = (userId?: string | null): boolean => !!userId && getOwnerIdsClient().includes(userId)
