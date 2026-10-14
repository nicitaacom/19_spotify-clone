-- =====================================================
-- 🎵 SEARCHABLE SONG TAGS — EXISTING MUSIC DATABASE
-- =====================================================
-- Copy this entire file into Supabase → SQL Editor and run it.
-- This adds tags, search, and public recommendations. Existing songs/files stay in place.
-- You can run this file again safely.

BEGIN;

-- =====================================================
-- 1. ADD TAGS TO SONGS
-- Examples: ARRAY['happy', 'energy', 'fast']
-- Existing songs start with an empty list of tags.
-- =====================================================

ALTER TABLE public."19_songs"
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- =====================================================
-- 2. CHECK THE TAG FORMAT
-- Maximum: 12 distinct tags; 32 characters per tag.
-- Use lowercase letters/numbers, spaces, hyphens, or underscores.
-- =====================================================

CREATE OR REPLACE FUNCTION public.valid_music_song_tags(song_tags TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
    SELECT
        song_tags IS NOT NULL
        AND COALESCE(array_ndims(song_tags), 1) = 1
        AND COALESCE(array_lower(song_tags, 1), 1) = 1
        AND cardinality(song_tags) <= 12
        AND NOT EXISTS (
            SELECT 1
            FROM unnest(song_tags) AS entry(tag)
            WHERE tag IS NULL
               OR char_length(tag) NOT BETWEEN 1 AND 32
               OR tag <> lower(btrim(regexp_replace(tag, '[[:space:]]+', ' ', 'g')))
               OR tag !~ '^[[:alnum:]][[:alnum:] _-]*$'
        )
        AND cardinality(song_tags) = (
            SELECT count(DISTINCT tag)
            FROM unnest(song_tags) AS entry(tag)
        );
$function$;

DO $constraints$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public."19_songs"'::regclass
          AND conname = '19_songs_tags_valid'
    ) THEN
        ALTER TABLE public."19_songs"
            ADD CONSTRAINT "19_songs_tags_valid"
            CHECK (public.valid_music_song_tags(tags));
    END IF;
END;
$constraints$;

-- =====================================================
-- 3. INDEX TAGS FOR EXACT TAG LOOKUPS / RECOMMENDATIONS
-- =====================================================

CREATE INDEX IF NOT EXISTS "19_songs_tags_gin_idx"
    ON public."19_songs" USING GIN (tags);

-- =====================================================
-- 4. SEARCH TITLE, AUTHOR, OR TAGS
-- Searches use the caller's existing song-read permissions.
-- Private and locked song metadata keeps its current protection.
-- =====================================================

CREATE OR REPLACE FUNCTION public.search_music_songs(p_query TEXT)
RETURNS SETOF public."19_songs"
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
    WITH search AS (
        SELECT left(btrim(COALESCE(p_query, '')), 200) AS query
    )
    SELECT song.*
    FROM public."19_songs" AS song
    CROSS JOIN search
    WHERE search.query <> ''
      AND (
          song.title ILIKE '%' || search.query || '%'
          OR song.author ILIKE '%' || search.query || '%'
          OR song.tags @> ARRAY[lower(search.query)]
          OR EXISTS (
              SELECT 1
              FROM unnest(song.tags) AS entry(tag)
              WHERE tag ILIKE '%' || search.query || '%'
          )
      )
    ORDER BY song.created_at DESC, song.id DESC
    LIMIT 100;
$function$;

REVOKE ALL ON FUNCTION public.search_music_songs(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_music_songs(TEXT) TO anon, authenticated;

-- =====================================================
-- 5. PUBLIC MUSIC RECOMMENDATIONS FOR JOKIK IMAGES
-- Only a song's own publisher can make it publicly recommendable.
-- Paid, private, and unlisted-only playlist tracks are excluded.
-- Returns metadata only: never audio files, purchases, or user details.
-- =====================================================

CREATE OR REPLACE FUNCTION public.recommend_public_music(
    p_tags TEXT[],
    p_limit INTEGER DEFAULT 6
)
RETURNS TABLE (
    id BIGINT,
    title TEXT,
    author TEXT,
    image_path TEXT,
    tags TEXT[],
    playlist_slug TEXT,
    matched_tags TEXT[]
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
    WITH requested AS (
        SELECT ARRAY(
            SELECT DISTINCT lower(btrim(tag))
            FROM unnest(COALESCE(p_tags, ARRAY[]::TEXT[])) AS entry(tag)
            WHERE char_length(tag) BETWEEN 1 AND 32
            LIMIT 12
        ) AS tags
    )
    SELECT
        song.id,
        song.title,
        song.author,
        song.image_path,
        song.tags,
        published.slug,
        matches.tags
    FROM public."19_songs" AS song
    CROSS JOIN requested
    JOIN LATERAL (
        SELECT playlist.slug
        FROM public."19_playlist_songs" AS membership
        JOIN public."19_playlists" AS playlist
          ON playlist.id = membership.playlist_id
        LEFT JOIN public."19_song_access" AS access
          ON access.playlist_id = membership.playlist_id
         AND access.song_id = membership.song_id
        WHERE membership.song_id = song.id
          AND playlist.visibility = 'public'
          AND playlist.user_id = song.user_id
          AND NOT COALESCE(access.is_paid, FALSE)
        ORDER BY playlist.created_at DESC, playlist.id
        LIMIT 1
    ) AS published ON TRUE
    CROSS JOIN LATERAL (
        SELECT ARRAY(
            SELECT tag
            FROM unnest(song.tags) AS entry(tag)
            WHERE tag = ANY(requested.tags)
            ORDER BY tag
        ) AS tags
    ) AS matches
    WHERE cardinality(requested.tags) > 0
      AND song.tags && requested.tags
    ORDER BY cardinality(matches.tags) DESC, song.created_at DESC, song.id DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 6), 12));
$function$;

REVOKE ALL ON FUNCTION public.recommend_public_music(TEXT[], INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recommend_public_music(TEXT[], INTEGER) TO anon, authenticated;

-- Refresh the API's table/function information after adding tags.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ✅ Finished. "Success. No rows returned" is normal.
