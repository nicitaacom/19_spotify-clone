# Playlists

## Cover

A playlist cover is `19_playlists.cover_image_path` when that column is set. Otherwise it is the image of the first playable song. The manager or the site admin uploads a replacement with `POST /api/playlists/[id]/cover` (multipart field `image`, 10 MB, JPG, JPEG, PNG, WebP, or AVIF). The file is stored in the `images` bucket. The previous custom cover is removed after the row updates. The backup of that file is still the open item in `plans/plan-24-backup-parity.md`.
