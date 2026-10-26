export interface PlaylistRead<T> {
  data: T | null
  error: { message: string } | null
}

// A failed read is a different result from an empty read. The page calls notFound() only for an empty result.
export function choosePlaylistRow<T>(
  userRead: PlaylistRead<T>,
  retryRead: PlaylistRead<T> | null,
  adminRead: PlaylistRead<T>,
): { row: T | null; failure: string | null } {
  if (userRead.data) return { row: userRead.data, failure: null }
  if (retryRead?.data) return { row: retryRead.data, failure: null }
  if (adminRead.data) return { row: adminRead.data, failure: null }
  if (userRead.error && adminRead.error) {
    return {
      row: null,
      failure: `User client: ${userRead.error.message}. Admin client: ${adminRead.error.message}.`,
    }
  }
  return { row: null, failure: null }
}
