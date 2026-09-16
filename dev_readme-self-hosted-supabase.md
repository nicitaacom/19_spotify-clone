# Self-hosted Supabase operations

## Controlled deployment source

Coolify's managed Supabase template is not the source of truth. Operate the stack from:

```text
/opt/supabase-jokik
```

It keeps the existing Compose project and PostgreSQL volume:

```text
project: jpi1t531bq9zxhjaui5bv931
PostgreSQL volume: jpi1t531bq9zxhjaui5bv931_supabase-db-data
```

Start or restore the full stack:

```bash
cd /opt/supabase-jokik
docker compose --project-name jpi1t531bq9zxhjaui5bv931 -f docker-compose.yml up -d
```

Restart it intentionally:

```bash
docker compose --project-name jpi1t531bq9zxhjaui5bv931 \
  -f /opt/supabase-jokik/docker-compose.yml restart
```

Do **not** use Coolify **Deploy** or **Restart** for this service. Those operations regenerate the
managed Compose source with `minio/mc`, which this VPS cannot pull, and omit the Google Auth
passthrough variables. A Coolify restart can leave the public gateway showing `no available server`.

## MinIO template workaround

The controlled `docker-compose.yml` must use this image in `minio-createbucket`:

```yaml
image: ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z
```

Do not use `minio/mc`; `docker pull minio/mc:latest` returns `pull access denied` on this VPS.

## Public Supabase endpoint

The only public Supabase domain is:

```text
https://supabase.music.jokik.fi
```

It belongs only to the Kong Compose resource (**Supabase Jokik Music**) on internal port `8000`.
Do not attach it to Studio or internal GoTrue. Do not use the retired
`kong.supabase.music.jokik.fi` hostname; Cloudflare cannot issue the required certificate for that
subdomain depth.

The app uses the single shared `supabaseClient` for both data and OAuth. Do not recreate a separate
auth client: both use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Google OAuth

Google Cloud Console must register this exact redirect URI for the OAuth client used by GoTrue:

```text
https://supabase.music.jokik.fi/auth/v1/callback
```

Edit environment values only in the controlled source:

```bash
nano /opt/supabase-jokik/.env
```

The controlled `.env` needs these values; never commit or paste the secret:

```env
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=...
GOTRUE_EXTERNAL_GOOGLE_SECRET=...
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.music.jokik.fi/auth/v1/callback
```

The `supabase-auth` environment block in `/opt/supabase-jokik/docker-compose.yml` must pass them
through explicitly:

```yaml
GOTRUE_EXTERNAL_GOOGLE_ENABLED: '${GOTRUE_EXTERNAL_GOOGLE_ENABLED}'
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: '${GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID}'
GOTRUE_EXTERNAL_GOOGLE_SECRET: '${GOTRUE_EXTERNAL_GOOGLE_SECRET}'
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: '${GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI}'
```

GoTrue must use these public URLs:

```yaml
API_EXTERNAL_URL: 'https://supabase.music.jokik.fi'
GOTRUE_SITE_URL: 'https://music.jokik.fi'
GOTRUE_URI_ALLOW_LIST: 'https://music.jokik.fi/auth/callback/oauth*,http://localhost:3000/**,http://localhost:3023/**'
```

`API_EXTERNAL_URL` is the OAuth callback endpoint. `GOTRUE_SITE_URL` and
`GOTRUE_URI_ALLOW_LIST` return users to the music app after login. Without them, login can fall
back to Supabase Studio (`/project/default?...`) or reject localhost and fall back to production.

After changing an Auth environment variable or Auth Compose configuration, recreate only GoTrue:

```bash
docker compose --project-name jpi1t531bq9zxhjaui5bv931 \
  -f /opt/supabase-jokik/docker-compose.yml \
  up -d --no-deps --force-recreate supabase-auth
```

For local OAuth, GoTrue must allow the *exact browser origin*. The controlled deployment currently
allows both common development ports, `3000` and `3023`. If the dev server uses another port, add
that origin to `GOTRUE_URI_ALLOW_LIST` and recreate GoTrue.

To apply the known-working local OAuth configuration on the VPS:

```bash
sed -i "s|GOTRUE_URI_ALLOW_LIST: .*|GOTRUE_URI_ALLOW_LIST: 'https://music.jokik.fi/auth/callback/oauth*,http://localhost:3000/**,http://localhost:3023/**'|" \
  /opt/supabase-jokik/docker-compose.yml

grep 'GOTRUE_URI_ALLOW_LIST' /opt/supabase-jokik/docker-compose.yml

docker compose --project-name jpi1t531bq9zxhjaui5bv931 \
  -f /opt/supabase-jokik/docker-compose.yml \
  up -d --no-deps --force-recreate supabase-auth
```

The final command is required: GoTrue only reads Compose environment values when its container is
created. Do not run these commands through Coolify; its generated Compose file does not retain the
custom changes.

## Backups

Backups created before moving to the controlled source:

```text
/root/backups/supabase-jokik-before-custom-compose-2026-09-16.tar.gz
/root/backups/supabase-jokik-before-custom-compose-2026-09-16.sql.gz
```

The compressed PostgreSQL backup is a `pg_dumpall` export of the 12 GB `_supabase` database:

```text
SHA-256: 5ffca5b80476d8d99bdec569a6c45b47ff375ba2d163b5c9e866fdc719366a57
Compressed size: 1.6 GB
```

Create a new compressed logical backup without stopping PostgreSQL:

```bash
docker exec supabase-db-jpi1t531bq9zxhjaui5bv931 \
  sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dumpall -U postgres' \
  | gzip -1 \
  > /root/backups/supabase-jokik-before-custom-compose-2026-09-16.sql.gz
```

Verify a dump:

```bash
gzip -t /root/backups/supabase-jokik-before-custom-compose-2026-09-16.sql.gz
sha256sum /root/backups/supabase-jokik-before-custom-compose-2026-09-16.sql.gz
```

Do not create an uncompressed `pg_dumpall` backup on this VPS: it reached 18 GB and was cancelled.
