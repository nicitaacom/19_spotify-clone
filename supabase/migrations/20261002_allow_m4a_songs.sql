-- Keep existing MIME types and add audio/mp4 for M4A uploads.
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'audio/mp4')
WHERE id = 'songs'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('audio/mp4' = ANY(allowed_mime_types));
