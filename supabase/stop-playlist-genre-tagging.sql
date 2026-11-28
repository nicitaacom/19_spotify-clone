-- Stop adding playlist-title genres to song tags when a song is linked or a playlist is renamed.
-- Existing song tags remain unchanged because manually selected tags cannot be distinguished from old automatic tags.
BEGIN;
DROP TRIGGER IF EXISTS add_playlist_genre_tags ON public."19_playlist_songs";
DROP TRIGGER IF EXISTS add_renamed_playlist_genre_tags ON public."19_playlists";
COMMIT;
