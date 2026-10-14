-- =====================================================
-- 🎵 SONG TAGS, GENRES, SEARCH AND ENVIRONMENT MATCHING
-- Copy this WHOLE file into the MUSIC project's SQL Editor.
-- Repeatable. Existing songs, files and permissions remain.
-- Run the latest file again if an earlier tags update ran.
-- =====================================================

BEGIN;

-- 1. Canonical names: lo-fi/lofi, hiphop/hip-hop, authumn/autumn, etc.
CREATE OR REPLACE FUNCTION public.canonical_music_tag(value TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE SET search_path = pg_catalog, public
AS $function$
    WITH input AS (
        SELECT lower(btrim(regexp_replace(normalize(COALESCE(value, ''), NFC), '[[:space:]]+', ' ', 'g'))) AS tag
    ), aliases(alias, tag) AS (VALUES
        ('authumn', 'autumn'),
        ('fall', 'autumn'),
        ('cosy', 'cozy'),
        ('lo-fi', 'lofi'),
        ('lo fi', 'lofi'),
        ('hiphop', 'hip-hop'),
        ('hip hop', 'hip-hop'),
        ('metall', 'metal'),
        ('heavy metal', 'metal'),
        ('drum&base', 'drum-and-bass'),
        ('drum&bass', 'drum-and-bass'),
        ('drum & bass', 'drum-and-bass'),
        ('drum & base', 'drum-and-bass'),
        ('drum and base', 'drum-and-bass'),
        ('drum and bass', 'drum-and-bass'),
        ('drum n bass', 'drum-and-bass'),
        ('dnb', 'drum-and-bass'),
        ('d&b', 'drum-and-bass'),
        ('r&b', 'rnb'),
        ('r and b', 'rnb'),
        ('rhythm and blues', 'rnb'),
        ('hard rock', 'hard-rock'),
        ('rain', 'rainy'),
        ('snow', 'snowy'),
        ('sun', 'sunny'),
        ('wind', 'windy'),
        ('storm', 'stormy'),
        ('fog', 'foggy'),
        ('mist', 'misty'),
        ('noon', 'midday'),
        ('mid-day', 'midday'),
        ('energetic', 'energy')
    )
    SELECT COALESCE((SELECT aliases.tag FROM aliases WHERE aliases.alias = input.tag), input.tag)
    FROM input;
$function$;

CREATE OR REPLACE FUNCTION public.canonical_music_tags(values_ TEXT[])
RETURNS TEXT[] LANGUAGE SQL IMMUTABLE SET search_path = pg_catalog, public
AS $function$
    SELECT ARRAY(
        SELECT tag FROM (
            SELECT CASE WHEN entry IS NULL THEN NULL ELSE public.canonical_music_tag(entry) END AS tag, min(position) AS position
            FROM unnest(COALESCE(values_, ARRAY[]::TEXT[])) WITH ORDINALITY AS input(entry, position)
            GROUP BY CASE WHEN entry IS NULL THEN NULL ELSE public.canonical_music_tag(entry) END
        ) AS canonical WHERE tag IS NULL OR tag <> '' ORDER BY position
    );
$function$;

-- 2. Up to 32 labels for overlapping time/season/weather/vibe/genres.
ALTER TABLE public."19_songs" ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE OR REPLACE FUNCTION public.valid_music_song_tags(song_tags TEXT[])
RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE SET search_path = pg_catalog, public
AS $function$
    SELECT song_tags IS NOT NULL
       AND COALESCE(array_ndims(song_tags), 1) = 1
       AND COALESCE(array_lower(song_tags, 1), 1) = 1
       AND cardinality(song_tags) <= 32
       AND NOT EXISTS (
           SELECT 1 FROM unnest(song_tags) AS entry(tag)
           WHERE tag IS NULL OR char_length(tag) NOT BETWEEN 1 AND 32
              OR tag <> public.canonical_music_tag(tag)
              OR tag !~ '^[[:alnum:]][[:alnum:] _-]*$'
       )
       AND cardinality(song_tags) = (SELECT count(DISTINCT tag) FROM unnest(song_tags) AS entry(tag));
$function$;
DO $constraints$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public."19_songs"'::regclass AND conname = '19_songs_tags_valid') THEN
        ALTER TABLE public."19_songs" ADD CONSTRAINT "19_songs_tags_valid" CHECK(public.valid_music_song_tags(tags));
    END IF;
END;
$constraints$;
CREATE INDEX IF NOT EXISTS "19_songs_tags_gin_idx" ON public."19_songs" USING GIN(tags);
CREATE OR REPLACE FUNCTION public.normalize_music_song_tags()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $function$
BEGIN
    NEW.tags := public.canonical_music_tags(NEW.tags);
    RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS normalize_music_song_tags ON public."19_songs";
CREATE TRIGGER normalize_music_song_tags BEFORE INSERT OR UPDATE OF tags ON public."19_songs"
FOR EACH ROW EXECUTE FUNCTION public.normalize_music_song_tags();

-- 3. Genres in playlist titles/slugs become song tags automatically.
-- Whole phrases only; "hip-hop", "hiphop" and "hip hop" are one genre.
CREATE OR REPLACE FUNCTION public.infer_music_genres(name TEXT)
RETURNS TEXT[] LANGUAGE SQL IMMUTABLE SET search_path = pg_catalog, public
AS $function$
    WITH input AS (
        SELECT ' ' || btrim(regexp_replace(lower(normalize(COALESCE(name, ''), NFC)), '[^[:alnum:]]+', ' ', 'g')) || ' ' AS title
    ), genres(phrase, tag) AS (VALUES
        ('hip hop', 'hip-hop'),
        ('pop', 'pop'),
        ('rock', 'rock'),
        ('metal', 'metal'),
        ('drum and bass', 'drum-and-bass'),
        ('lofi', 'lofi'),
        ('ambient', 'ambient'),
        ('acoustic', 'acoustic'),
        ('piano', 'piano'),
        ('jazz', 'jazz'),
        ('classical', 'classical'),
        ('blues', 'blues'),
        ('country', 'country'),
        ('dance', 'dance'),
        ('disco', 'disco'),
        ('dubstep', 'dubstep'),
        ('electronic', 'electronic'),
        ('house', 'house'),
        ('techno', 'techno'),
        ('trance', 'trance'),
        ('edm', 'edm'),
        ('rnb', 'rnb'),
        ('reggae', 'reggae'),
        ('soul', 'soul'),
        ('punk', 'punk'),
        ('funk', 'funk'),
        ('folk', 'folk'),
        ('indie', 'indie'),
        ('gospel', 'gospel'),
        ('soundtrack', 'soundtrack'),
        ('latin', 'latin'),
        ('synthwave', 'synthwave'),
        ('afrobeats', 'afrobeats'),
        ('hard rock', 'hard-rock'),
        ('chill', 'chill'),
        ('lo fi', 'lofi'),
        ('hiphop', 'hip-hop'),
        ('metall', 'metal'),
        ('heavy metal', 'metal'),
        ('drum base', 'drum-and-bass'),
        ('drum bass', 'drum-and-bass'),
        ('drum and base', 'drum-and-bass'),
        ('drum n bass', 'drum-and-bass'),
        ('dnb', 'drum-and-bass'),
        ('d b', 'drum-and-bass'),
        ('r b', 'rnb'),
        ('r and b', 'rnb'),
        ('rhythm and blues', 'rnb')
    )
    SELECT ARRAY(SELECT DISTINCT tag FROM genres, input WHERE strpos(input.title, ' ' || phrase || ' ') > 0 ORDER BY tag);
$function$;
CREATE OR REPLACE FUNCTION public.add_playlist_genre_tags()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
BEGIN
    -- Other listeners' playlists cannot alter a publisher's tags.
    UPDATE public."19_songs" song SET tags = public.canonical_music_tags(song.tags || public.infer_music_genres(playlist.title || ' ' || playlist.slug))
    FROM public."19_playlists" playlist
    WHERE playlist.id = NEW.playlist_id AND song.id = NEW.song_id AND song.user_id = playlist.user_id;
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.add_playlist_genre_tags() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS add_playlist_genre_tags ON public."19_playlist_songs";
CREATE TRIGGER add_playlist_genre_tags AFTER INSERT OR UPDATE OF playlist_id, song_id ON public."19_playlist_songs"
FOR EACH ROW EXECUTE FUNCTION public.add_playlist_genre_tags();
CREATE OR REPLACE FUNCTION public.add_renamed_playlist_genre_tags()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
BEGIN
    UPDATE public."19_songs" song SET tags = public.canonical_music_tags(song.tags || public.infer_music_genres(NEW.title || ' ' || NEW.slug))
    FROM public."19_playlist_songs" membership
    WHERE membership.playlist_id = NEW.id AND membership.song_id = song.id AND song.user_id = NEW.user_id;
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.add_renamed_playlist_genre_tags() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS add_renamed_playlist_genre_tags ON public."19_playlists";
CREATE TRIGGER add_renamed_playlist_genre_tags AFTER UPDATE OF title, slug ON public."19_playlists"
FOR EACH ROW EXECUTE FUNCTION public.add_renamed_playlist_genre_tags();
-- Existing playlist music receives its genres too. Manual labels are retained.
UPDATE public."19_songs" song SET tags = public.canonical_music_tags(song.tags || COALESCE((
    SELECT array_agg(DISTINCT genre)
    FROM public."19_playlist_songs" membership JOIN public."19_playlists" playlist ON playlist.id = membership.playlist_id
    CROSS JOIN LATERAL unnest(public.infer_music_genres(playlist.title || ' ' || playlist.slug)) AS entry(genre)
    WHERE membership.song_id = song.id AND playlist.user_id = song.user_id
), ARRAY[]::TEXT[]));

-- 4. Ctrl+K/title/artist/tag search keeps the caller's existing row permissions.
CREATE OR REPLACE FUNCTION public.search_music_songs(p_query TEXT)
RETURNS SETOF public."19_songs" LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = pg_catalog, public
AS $function$
    WITH search AS (SELECT left(btrim(COALESCE(p_query, '')), 200) AS query)
    SELECT song.* FROM public."19_songs" song CROSS JOIN search
    WHERE search.query <> '' AND (
        song.title ILIKE '%' || search.query || '%' OR song.author ILIKE '%' || search.query || '%'
        OR song.tags @> ARRAY[public.canonical_music_tag(search.query)]
        OR EXISTS(SELECT 1 FROM unnest(song.tags) AS entry(tag) WHERE tag ILIKE '%' || search.query || '%')
    ) ORDER BY song.created_at DESC, song.id DESC LIMIT 100;
$function$;
REVOKE ALL ON FUNCTION public.search_music_songs(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_music_songs(TEXT) TO anon, authenticated;

-- 5. Internal public/free catalog helper: never audio paths or user records.
CREATE OR REPLACE FUNCTION public.public_music_catalog()
RETURNS TABLE(id BIGINT, title TEXT, author TEXT, image_path TEXT, created_at TIMESTAMPTZ, tags TEXT[], playlist_slug TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
    SELECT song.id, song.title, song.author, song.image_path, song.created_at, song.tags, published.slug
    FROM public."19_songs" song
    JOIN LATERAL (
        SELECT playlist.slug FROM public."19_playlist_songs" membership
        JOIN public."19_playlists" playlist ON playlist.id = membership.playlist_id
        LEFT JOIN public."19_song_access" access ON access.playlist_id = membership.playlist_id AND access.song_id = membership.song_id
        WHERE membership.song_id = song.id AND playlist.visibility = 'public'
          AND playlist.user_id = song.user_id AND NOT COALESCE(access.is_paid, FALSE)
        ORDER BY playlist.created_at DESC, playlist.id LIMIT 1
    ) published ON TRUE;
$function$;
REVOKE ALL ON FUNCTION public.public_music_catalog() FROM PUBLIC, anon, authenticated;

-- 6. Combine independent contexts. Explicit incompatible contexts are excluded.
-- Morning/midday/evening and sunrise/sunset are checked separately from day/night.
-- Songs without a context restriction remain eligible as general mood matches.
CREATE OR REPLACE FUNCTION public.recommend_public_music(p_tags TEXT[], p_limit INTEGER DEFAULT 6)
RETURNS TABLE(id BIGINT, title TEXT, author TEXT, image_path TEXT, tags TEXT[], playlist_slug TEXT, matched_tags TEXT[])
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
    WITH requested AS (
        SELECT ARRAY(SELECT tag FROM unnest(public.canonical_music_tags(p_tags)) AS entry(tag) WHERE char_length(tag) BETWEEN 1 AND 32 LIMIT 32) AS tags,
          CASE WHEN public.canonical_music_tag(p_tags[1]) = ANY(ARRAY['halloween', 'new-year', 'love', 'food', 'enterprise', 'it-worked', 'gray-3d-small-dot']::TEXT[]) THEN public.canonical_music_tag(p_tags[1]) END AS theme
    )
    SELECT song.id, song.title, song.author, song.image_path, song.tags, song.playlist_slug, matches.tags
    FROM public.public_music_catalog() song CROSS JOIN requested
    CROSS JOIN LATERAL (SELECT ARRAY(SELECT tag FROM unnest(song.tags) AS entry(tag) WHERE tag = ANY(requested.tags) ORDER BY tag) AS tags) matches
    WHERE cardinality(requested.tags) > 0 AND song.tags && requested.tags
      AND (NOT song.tags && ARRAY['winter', 'autumn', 'spring', 'summer']::TEXT[]
           OR NOT requested.tags && ARRAY['winter', 'autumn', 'spring', 'summer']::TEXT[]
           OR song.tags && (SELECT ARRAY(SELECT unnest(requested.tags) INTERSECT SELECT unnest(ARRAY['winter', 'autumn', 'spring', 'summer']::TEXT[])))) -- season
      AND (NOT song.tags && ARRAY['day', 'night']::TEXT[]
           OR NOT requested.tags && ARRAY['day', 'night']::TEXT[]
           OR song.tags && (SELECT ARRAY(SELECT unnest(requested.tags) INTERSECT SELECT unnest(ARRAY['day', 'night']::TEXT[])))) -- day/night
      AND (NOT song.tags && ARRAY['morning', 'midday', 'afternoon', 'evening']::TEXT[]
           OR NOT requested.tags && ARRAY['day', 'night', 'morning', 'midday', 'afternoon', 'evening', 'twilight', 'sunrise', 'sunset', 'dawn', 'dusk']::TEXT[]
           OR song.tags && (SELECT ARRAY(SELECT unnest(requested.tags) INTERSECT SELECT unnest(ARRAY['morning', 'midday', 'afternoon', 'evening']::TEXT[])))) -- morning/midday/afternoon/evening
      AND (NOT song.tags && ARRAY['sunrise', 'sunset', 'dawn', 'dusk', 'twilight']::TEXT[]
           OR NOT requested.tags && ARRAY['day', 'night', 'morning', 'midday', 'afternoon', 'evening', 'twilight', 'sunrise', 'sunset', 'dawn', 'dusk']::TEXT[]
           OR song.tags && (SELECT ARRAY(SELECT unnest(requested.tags) INTERSECT SELECT unnest(ARRAY['sunrise', 'sunset', 'dawn', 'dusk', 'twilight']::TEXT[])))) -- solar event
      AND (NOT song.tags && ARRAY['sunny', 'clear', 'partly-cloudy', 'cloudy', 'overcast', 'rainy', 'drizzle', 'snowy', 'blizzard', 'stormy', 'foggy', 'misty', 'freezing-fog', 'freezing-rain', 'sleet', 'hail', 'windy', 'hazy', 'dusty', 'smoky', 'tornado']::TEXT[]
           OR NOT requested.tags && ARRAY['sunny', 'clear', 'partly-cloudy', 'cloudy', 'overcast', 'rainy', 'drizzle', 'snowy', 'blizzard', 'stormy', 'foggy', 'misty', 'freezing-fog', 'freezing-rain', 'sleet', 'hail', 'windy', 'hazy', 'dusty', 'smoky', 'tornado']::TEXT[]
           OR song.tags && (SELECT ARRAY(SELECT unnest(requested.tags) INTERSECT SELECT unnest(ARRAY['sunny', 'clear', 'partly-cloudy', 'cloudy', 'overcast', 'rainy', 'drizzle', 'snowy', 'blizzard', 'stormy', 'foggy', 'misty', 'freezing-fog', 'freezing-rain', 'sleet', 'hail', 'windy', 'hazy', 'dusty', 'smoky', 'tornado']::TEXT[])))) -- weather
      AND (NOT song.tags && ARRAY['cold', 'freezing', 'extra-cold', 'ultra-cold', 'mild', 'warm', 'hot', 'extra-hot', 'ultra-hot']::TEXT[]
           OR NOT requested.tags && ARRAY['cold', 'freezing', 'extra-cold', 'ultra-cold', 'mild', 'warm', 'hot', 'extra-hot', 'ultra-hot']::TEXT[]
           OR song.tags && (SELECT ARRAY(SELECT unnest(requested.tags) INTERSECT SELECT unnest(ARRAY['cold', 'freezing', 'extra-cold', 'ultra-cold', 'mild', 'warm', 'hot', 'extra-hot', 'ultra-hot']::TEXT[])))) -- temperature
      AND (NOT song.tags && ARRAY['bright', 'dark', 'golden', 'moonlight']::TEXT[]
           OR NOT requested.tags && ARRAY['bright', 'dark', 'golden', 'moonlight']::TEXT[]
           OR song.tags && (SELECT ARRAY(SELECT unnest(requested.tags) INTERSECT SELECT unnest(ARRAY['bright', 'dark', 'golden', 'moonlight']::TEXT[])))) -- lighting
    ORDER BY
        CASE WHEN requested.theme IS NOT NULL AND song.tags @> ARRAY[requested.theme] THEN 1 ELSE 0 END DESC,
        (cardinality(matches.tags) + 4 * (
            CASE WHEN matches.tags && ARRAY['day', 'night', 'morning', 'midday', 'afternoon', 'evening', 'twilight', 'sunrise', 'sunset', 'dawn', 'dusk']::TEXT[] THEN 1 ELSE 0 END
          + CASE WHEN matches.tags && ARRAY['winter', 'autumn', 'spring', 'summer']::TEXT[] THEN 1 ELSE 0 END
          + CASE WHEN matches.tags && ARRAY['sunny', 'clear', 'partly-cloudy', 'cloudy', 'overcast', 'rainy', 'drizzle', 'snowy', 'blizzard', 'stormy', 'foggy', 'misty', 'freezing-fog', 'freezing-rain', 'sleet', 'hail', 'windy', 'hazy', 'dusty', 'smoky', 'tornado']::TEXT[] THEN 1 ELSE 0 END
          + CASE WHEN matches.tags && ARRAY['cold', 'freezing', 'extra-cold', 'ultra-cold', 'mild', 'warm', 'hot', 'extra-hot', 'ultra-hot']::TEXT[] THEN 1 ELSE 0 END
        )) DESC, song.created_at DESC, song.id DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 6), 12));
$function$;
REVOKE ALL ON FUNCTION public.recommend_public_music(TEXT[], INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recommend_public_music(TEXT[], INTEGER) TO anon, authenticated;

-- 7. Public music search for the image app uses the same safe catalog.
CREATE OR REPLACE FUNCTION public.search_public_music(p_query TEXT, p_limit INTEGER DEFAULT 6)
RETURNS TABLE(id BIGINT, title TEXT, author TEXT, image_path TEXT, tags TEXT[], playlist_slug TEXT, matched_tags TEXT[])
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
    WITH search AS (SELECT left(btrim(COALESCE(p_query, '')), 200) AS query)
    SELECT song.id, song.title, song.author, song.image_path, song.tags, song.playlist_slug,
        ARRAY(SELECT tag FROM unnest(song.tags) AS entry(tag) WHERE tag = public.canonical_music_tag(search.query) OR tag ILIKE '%' || search.query || '%')
    FROM public.public_music_catalog() song CROSS JOIN search
    WHERE search.query <> '' AND (
        song.title ILIKE '%' || search.query || '%' OR song.author ILIKE '%' || search.query || '%'
        OR song.tags @> ARRAY[public.canonical_music_tag(search.query)]
        OR EXISTS(SELECT 1 FROM unnest(song.tags) AS entry(tag) WHERE tag ILIKE '%' || search.query || '%')
    ) ORDER BY song.created_at DESC, song.id DESC LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 6), 12));
$function$;
REVOKE ALL ON FUNCTION public.search_public_music(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_public_music(TEXT, INTEGER) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ✅ "Success. No rows returned" is normal.
