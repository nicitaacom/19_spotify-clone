// The ONLY project-specific file in the backup feature. Everything the routes and the SDK need
// that varies from one project to the next lives here: which tables/buckets are backed up, how
// each table's columns round-trip through CSV, who is allowed to run a backup, which rows/files a
// given caller may read or write, and how to build a public URL for a stored file. To port this
// feature into another project, copy the whole backup folder and edit only this file (see
// dev_readme-backup.md for the questions to answer).
//
// This project (19_spotify-clone) is per-user: every table is scoped to the session user via
// user_id (or, for 19_playlist_songs, via the playlists that user owns), and a file may only be
// read/written if its path is one of that user's own 19_songs.song_path/image_path.

// Untyped on purpose: the routes pass a client typed to this project's full generated Database
// schema (SupabaseClient<Database>). Threading that specific generic through every function here
// causes TypeScript's inference to recurse ("Type instantiation is excessively deep") once a
// scopeSelect implementation calls `.from(table).select().eq()` — the resulting builder type
// nests the whole schema. Plain `any` (not SupabaseClient<any,any,any>, which still recurses) is
// the actual fix — routes still get full typing on `supabaseAdmin` itself at the call site; only
// the parameter type of these config functions is loosened.
type AnySupabaseClient = any

// ── tables ────────────────────────────────────────────────────────────────────
//
// CSV stores every cell as text. PostgREST coerces most column types (timestamp/uuid/enum/bool)
// from a string on upsert, but three kinds must be handled explicitly so they survive a
// round-trip, so each table declares them:
//   numericColumns — sent as a JS number, never the string "42" (a title of "123" must stay text)
//   arrayColumns   — Postgres text[] written/read as an array literal, e.g. {a,b}
//   jsonColumns    — jsonb and jsonb[] written/read as JSON so structure is preserved
//
// scopeSelect/scopeRows implement per-user row-level scoping (omit both for an admin/no-scoping
// project — see 26_hot-delivery's backupConfig.ts for that shape):
//   scopeSelect(admin, userId) — GET: return this table's rows visible to the caller
//   scopeRows(admin, userId, rows) — POST: given the rows the browser sent, return only the ones
//     the caller may write (foreign rows silently skipped, never written)
export interface BackupTableConfig {
  name: string
  onConflict: string
  numericColumns: string[]
  arrayColumns: string[]
  jsonColumns: string[]
  scopeSelect?: (admin: AnySupabaseClient, userId: string) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string; code?: string; details?: string; hint?: string } | null }>
  scopeRows?: (admin: AnySupabaseClient, userId: string, rows: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>
}

async function scopeToOwnPlaylistSongs(admin: AnySupabaseClient, userId: string, rows: Record<string, unknown>[]) {
  const { data: userPlaylists } = await admin.from("19_playlists").select("id").eq("user_id", userId)
  const ownedPlaylistIds = new Set((userPlaylists ?? []).map((playlist: any) => playlist.id))
  return rows.filter((row: any) => ownedPlaylistIds.has(row.playlist_id))
}

export const BACKUP_TABLES: BackupTableConfig[] = [
  {
    name: "19_songs",
    onConflict: "id",
    numericColumns: ["id", "size_bytes"],
    arrayColumns: [],
    jsonColumns: [],
    scopeSelect: async (admin, userId) => await admin.from("19_songs").select("*").eq("user_id", userId),
    scopeRows: async (_admin, userId, rows) => rows.filter(row => ("user_id" in row ? row.user_id === userId : true)),
  },
  {
    // types_db.ts: 19_liked_songs has no id column — Row is { created_at, song_id, user_id },
    // PK is the composite (user_id, song_id).
    name: "19_liked_songs",
    onConflict: "user_id,song_id",
    numericColumns: ["song_id"],
    arrayColumns: [],
    jsonColumns: [],
    scopeSelect: async (admin, userId) => await admin.from("19_liked_songs").select("*").eq("user_id", userId),
    scopeRows: async (_admin, userId, rows) => rows.filter(row => ("user_id" in row ? row.user_id === userId : true)),
  },
  {
    name: "19_playlists",
    onConflict: "id",
    numericColumns: [],
    arrayColumns: [],
    jsonColumns: [],
    scopeSelect: async (admin, userId) => await admin.from("19_playlists").select("*").eq("user_id", userId),
    scopeRows: async (_admin, userId, rows) => rows.filter(row => ("user_id" in row ? row.user_id === userId : true)),
  },
  {
    name: "19_playlist_songs",
    onConflict: "playlist_id,song_id",
    numericColumns: ["position", "song_id"],
    arrayColumns: [],
    jsonColumns: [],
    scopeSelect: async (admin, userId) => {
      const { data: playlists } = await admin.from("19_playlists").select("id").eq("user_id", userId)
      const playlistIds = (playlists ?? []).map((playlist: any) => playlist.id)
      if (playlistIds.length === 0) return { data: [], error: null }
      return admin.from("19_playlist_songs").select("*").in("playlist_id", playlistIds)
    },
    scopeRows: scopeToOwnPlaylistSongs,
  },
]

export type BackupTableName = string

export function getTableConfig(name: string): BackupTableConfig | undefined {
  return BACKUP_TABLES.find(table => table.name === name)
}

// ── buckets ───────────────────────────────────────────────────────────────────

export const BACKUP_BUCKETS = ["songs", "images"] as const
export type BackupBucket = (typeof BACKUP_BUCKETS)[number]

export function isBackupBucket(value: string): value is BackupBucket {
  return (BACKUP_BUCKETS as readonly string[]).includes(value)
}

export interface BackupFileRef {
  bucket: string
  path: string
  size: number
  contentType: string
}

// ── file ownership ───────────────────────────────────────────────────────────
//
// Per-user: a file is owned if its path is one of this user's own 19_songs.song_path/image_path.
// listFiles derives the export list the same way (so export and the import ownership check always
// agree); isOwnedFile answers the yes/no question the import route needs per requested path.
async function loadOwnedSongs(admin: AnySupabaseClient, userId: string) {
  const { data, error } = await admin.from("19_songs").select("song_path, image_path").eq("user_id", userId)
  if (error) throw error
  return (data ?? []) as Array<{ song_path?: string | null; image_path?: string | null }>
}

export async function listFiles(admin: AnySupabaseClient, userId: string): Promise<BackupFileRef[]> {
  const songs = await loadOwnedSongs(admin, userId)
  const files: BackupFileRef[] = []
  for (const song of songs) {
    if (song.song_path) files.push({ bucket: "songs", path: song.song_path, size: 0, contentType: "audio/mpeg" })
    if (song.image_path) files.push({ bucket: "images", path: song.image_path, size: 0, contentType: "image/jpeg" })
  }
  return files
}

export async function isOwnedFile(admin: AnySupabaseClient, userId: string, bucket: string, path: string): Promise<boolean> {
  const songs = await loadOwnedSongs(admin, userId)
  if (bucket === "songs") return songs.some(song => song.song_path === path)
  if (bucket === "images") return songs.some(song => song.image_path === path)
  return false
}

// ── access boundary ─────────────────────────────────────────────────────────
//
// No project-wide gate here — every authenticated user may back up their own data; the row/file
// scoping above is the whole boundary. Kept as a function (always true) so routes share one call
// shape with projects that do need a role gate (see 26_hot-delivery's backupConfig.ts).
export async function assertBackupAccess(_userId: string, _admin: AnySupabaseClient): Promise<boolean> {
  return true
}

// ── public URL ──────────────────────────────────────────────────────────────
//
// Builds the public CDN URL the browser downloads each stored file from during a files export.
export function getPublicUrl(bucket: string, path: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set — cannot build public file URLs")
  const base = supabaseUrl.endsWith("/") ? supabaseUrl.slice(0, -1) : supabaseUrl
  return `${base}/storage/v1/object/public/${bucket}/${path}`
}
