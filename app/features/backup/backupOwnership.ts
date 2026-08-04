export type BackupOwnedRow = Record<string, unknown>

export function remapRowsToCurrentUser(rows: BackupOwnedRow[], userId: string): BackupOwnedRow[] {
  return rows.map(row => ({ ...row, user_id: userId }))
}

export function remapAndFilterOwnedRows(
  rows: BackupOwnedRow[],
  existingRows: BackupOwnedRow[],
  userId: string,
  keyColumn: string,
  pathColumns: string[] = [],
): BackupOwnedRow[] {
  const existingByKey = new Map(existingRows.map(row => [row[keyColumn], row]))
  const foreignPaths = new Set(
    existingRows.flatMap(row =>
      row.user_id === userId
        ? []
        : pathColumns.flatMap(column => (typeof row[column] === "string" && row[column] ? [row[column]] : [])),
    ),
  )

  return remapRowsToCurrentUser(rows, userId).filter(row => {
    const key = row[keyColumn]
    if (key === undefined || key === null || key === "") return false

    const existingRow = existingByKey.get(key)
    if (existingRow && existingRow.user_id !== userId) return false

    return pathColumns.every(column => {
      const path = row[column]
      return typeof path !== "string" || !path || !foreignPaths.has(path)
    })
  })
}

export function isFilePathOwnedExclusively(rows: BackupOwnedRow[], userId: string): boolean {
  return rows.length > 0 && rows.every(row => row.user_id === userId)
}
