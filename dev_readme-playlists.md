# Playlists

## Slug page

`app/(site)/playlists/[slug]/page.tsx` calls `getPlaylistBySlug`. A missing row, or a private playlist the viewer does not manage, calls `notFound()`. A failed read is a different result: the user client is tried once more, then `commerceAdmin` reads the same slug. When both clients return an error, the action throws and the route error screen offers another try. The private check still runs on a row that `commerceAdmin` returned.

## Cover

A playlist cover is `19_playlists.cover_image_path` when that column is set. Otherwise it is the image of the first playable song. The manager or the site admin uploads a replacement with `POST /api/playlists/[id]/cover` (multipart field `image`, 10 MB, JPG, JPEG, PNG, WebP, or AVIF). The file is stored in the `images` bucket. The previous custom cover is removed after the row updates. The backup of that file is still the open item in `plans/plan-24-backup-parity.md`.

## Playback

Play on a row passes the on-screen songs into the player queue. The advance control then plays the following row when a song finishes, or the same song when the control shows This song repeats. Reordering or removing a row in the playlist that is playing rewrites that queue to the on-screen order.
