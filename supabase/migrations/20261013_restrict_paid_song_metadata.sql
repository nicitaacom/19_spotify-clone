ALTER TABLE public."19_songs" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_read_song_metadata(p_song_id BIGINT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public."19_songs" AS song
      WHERE song.id = p_song_id
        AND song.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public."19_playlist_songs" AS membership
      JOIN public."19_playlists" AS playlist
        ON playlist.id = membership.playlist_id
      LEFT JOIN public."19_song_access" AS song_access
        ON song_access.playlist_id = membership.playlist_id
       AND song_access.song_id = membership.song_id
      WHERE membership.song_id = p_song_id
        AND (
          (playlist.visibility IN ('public', 'unlisted') AND NOT COALESCE(song_access.is_paid, FALSE))
          OR playlist.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public."19_playlist_orders" AS purchase
            WHERE purchase.playlist_id = playlist.id
              AND purchase.user_id = auth.uid()
              AND purchase.status = 'paid'
          )
        )
    );
$function$;

REVOKE ALL ON FUNCTION public.can_read_song_metadata(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_song_metadata(BIGINT) TO anon, authenticated;

DO $policies$
DECLARE
  existing_policy TEXT;
BEGIN
  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = '19_songs'
      AND cmd IN ('SELECT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public."19_songs"', existing_policy);
  END LOOP;
END;
$policies$;

CREATE POLICY "Allow authorized song metadata reads"
ON public."19_songs"
FOR SELECT
TO anon, authenticated
USING (public.can_read_song_metadata(id));
