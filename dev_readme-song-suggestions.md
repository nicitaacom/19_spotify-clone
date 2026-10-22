# Song suggestions

Signed-in listeners can propose a new title, author, or tags for a song they are allowed to play. The site admin approves or rejects the whole suggestion. The listener is not told the result.

## Table

`19_song_suggestions` holds one pending row per song and user. A second pending suggestion for the same song replaces the first. A user can have at most 20 pending rows. There are no row policies. Server routes use the service role.

## Routes

- `POST /api/songs/[id]/suggestions` — signed-in user who can play the song. Title and author are at most 200 characters. Tags go through `parseSongTags`. At least one field must differ.
- `GET /api/suggestions` — admin. Pending rows, each with the song's current title, author, and tags.
- `PATCH /api/suggestions/[id]` — admin, body `{ action: "approve" | "reject" }`. Approve updates `19_songs` with the non-null fields. Tags replace the previous tags.

## Screens

Playlist rows show Suggest edit for a signed-in viewer who is not editing that song. The admin sidebar item Suggestions shows the pending count. `/suggestions` lists each proposal with Approve and Reject.
