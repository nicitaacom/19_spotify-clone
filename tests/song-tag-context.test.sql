-- Run after song-tags-follow-up.sql in the disposable catalog fixture database.
BEGIN;
INSERT INTO public."19_songs" (id,title,author,tags,is_public) VALUES
 (501,'Winter night','Context artist',ARRAY['happy','night','winter','cold','rainy','cozy'],TRUE),
 (502,'Summer midday','Context artist',ARRAY['happy','day','midday','summer','hot','sunny','energy'],TRUE),
 (503,'Autumn sunset','Context artist',ARRAY['happy','day','evening','sunset','autumn','cold','cloudy','vibe','candle','fireplace','love'],TRUE),
 (504,'Any context','Context artist',ARRAY['happy'],TRUE),
 (505,'Winter midday','Context artist',ARRAY['happy','day','midday','winter','cold','rainy'],TRUE),
 (601,'Genre fixture','Genre artist',ARRAY[' Lo-fi ','lofi','HipHop','hip-hop','Drum&Base','metall'],TRUE);
INSERT INTO public."19_playlists" (slug,title,visibility) VALUES
 ('context-fixture','Context fixture','public'),
 ('genre-fixture','HIP-HOP / pop / rock / metall / drum&base / lo-fi','public');
INSERT INTO public."19_playlist_songs"
 SELECT playlist.id,song.id FROM public."19_playlists" playlist CROSS JOIN public."19_songs" song
 WHERE playlist.slug='context-fixture' AND song.id BETWEEN 501 AND 505
    OR playlist.slug='genre-fixture' AND song.id=601;
DO $checks$
BEGIN
 IF NOT (SELECT tags @> ARRAY['hip-hop','pop','rock','metal','drum-and-bass','lofi'] AND cardinality(tags)=6 FROM public."19_songs" WHERE id=601)
 THEN RAISE EXCEPTION 'Genre inference/alias deduplication failed'; END IF;
 IF public.infer_music_genres('popular metalworker') <> ARRAY[]::TEXT[] THEN RAISE EXCEPTION 'Genre substring false positive'; END IF;
END;
$checks$;
INSERT INTO public."19_playlists" (slug,title,user_id,visibility)
 VALUES ('foreign-genre','Techno','00000000-0000-0000-0000-000000000002','public');
INSERT INTO public."19_playlist_songs" SELECT id,601 FROM public."19_playlists" WHERE slug='foreign-genre';
UPDATE public."19_playlists" SET title='Soul and Jazz' WHERE slug='genre-fixture';
DO $checks$
BEGIN
 IF (SELECT tags @> ARRAY['techno'] FROM public."19_songs" WHERE id=601) THEN RAISE EXCEPTION 'Foreign listener altered publisher genres'; END IF;
 IF NOT (SELECT tags @> ARRAY['soul','jazz','pop','lofi'] FROM public."19_songs" WHERE id=601) THEN RAISE EXCEPTION 'Playlist rename lost manual/existing genres'; END IF;
END;
$checks$;
SET LOCAL ROLE anon;
DO $checks$
DECLARE alias TEXT; ids BIGINT[];
BEGIN
 FOREACH alias IN ARRAY ARRAY['hiphop','hip-hop','hip hop','lofi','lo-fi','lo fi','metall','metal','drum&base','drum & bass','dnb'] LOOP
   IF NOT EXISTS(SELECT 1 FROM public.search_music_songs(alias) WHERE id=601)
      OR NOT EXISTS(SELECT 1 FROM public.search_public_music(alias) WHERE id=601)
   THEN RAISE EXCEPTION 'Search alias failed: %',alias; END IF;
 END LOOP;
 SELECT array_agg(id ORDER BY id) INTO ids FROM public.recommend_public_music(ARRAY['happy','night','winter','cold','rainy']) WHERE id>=500;
 IF ids <> ARRAY[501,504]::BIGINT[] THEN RAISE EXCEPTION 'Winter night mixed context mismatch: %',ids; END IF;
 SELECT array_agg(id ORDER BY id) INTO ids FROM public.recommend_public_music(ARRAY['happy','day','midday','summer','hot','sunny','energy']) WHERE id>=500;
 IF ids <> ARRAY[502,504]::BIGINT[] THEN RAISE EXCEPTION 'Summer midday mixed context mismatch: %',ids; END IF;
 SELECT array_agg(id ORDER BY id) INTO ids FROM public.recommend_public_music(ARRAY['happy','day','evening','sunset','autumn','cold','cloudy']) WHERE id>=500;
 IF ids <> ARRAY[503,504]::BIGINT[] THEN RAISE EXCEPTION 'Autumn sunset mixed context mismatch: %',ids; END IF;
 IF EXISTS(SELECT 1 FROM public.recommend_public_music(ARRAY['happy','day','midday','autumn','cold','cloudy']) WHERE id=503)
 THEN RAISE EXCEPTION 'Sunset song recommended at midday'; END IF;
 IF (SELECT id FROM public.recommend_public_music(ARRAY['happy','day','evening','sunset','autumn','cold','cloudy'],1))<>503
 THEN RAISE EXCEPTION 'Exact context did not outrank generic mood'; END IF;
 IF has_function_privilege('anon','public.public_music_catalog()','EXECUTE')
 OR has_function_privilege('authenticated','public.add_playlist_genre_tags()','EXECUTE')
 THEN RAISE EXCEPTION 'Internal helper exposed'; END IF;
 RAISE NOTICE 'PASS genre aliases, membership/rename inference, publisher ownership, public search and mixed environment matching';
END;
$checks$;
ROLLBACK;
