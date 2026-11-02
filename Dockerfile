# music.jokik.fi on the VPS - the same shape as outreach-tool's own image (builder + standalone runner).
# Why not Cloudflare any more: a long song proxied through the Worker hits "Worker exceeded resource limits"
# (error 1102) and the whole site answers 503 once the plan's CPU time for the day is used up (the 11xx errors).
FROM node:25-alpine AS builder

WORKDIR /srv/music

RUN npm install pnpm@11.5.0 -g

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
# --ignore-scripts: sharp's native download, the supabase CLI binary, workerd and esbuild postinstalls all stay out -
# none of them runs during `next build`; sharp is installed fresh in the runner below
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

# NEXT_PUBLIC_* are inlined at `next build`; libs/stripe.ts, libs/deviceIdRedis.ts and the Supabase clients read the
# rest at import time while pages are rendered at build - so every value the running site needs is a build arg too
ARG NEXT_PUBLIC_PRODUCTION_URL
ENV NEXT_PUBLIC_PRODUCTION_URL=$NEXT_PUBLIC_PRODUCTION_URL

ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

ARG NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL

ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

ARG SUPABASE_SERVICE_ROLE_KEY
ENV SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY

ARG UPSTASH_REDIS_REST_URL
ENV UPSTASH_REDIS_REST_URL=$UPSTASH_REDIS_REST_URL

ARG UPSTASH_REDIS_REST_TOKEN
ENV UPSTASH_REDIS_REST_TOKEN=$UPSTASH_REDIS_REST_TOKEN

ARG PUSHER_APP_ID
ENV PUSHER_APP_ID=$PUSHER_APP_ID

ARG NEXT_PUBLIC_PUSHER_APP_KEY
ENV NEXT_PUBLIC_PUSHER_APP_KEY=$NEXT_PUBLIC_PUSHER_APP_KEY

ARG PUSHER_SECRET
ENV PUSHER_SECRET=$PUSHER_SECRET

ARG STRIPE_SECRET_KEY_TEST
ENV STRIPE_SECRET_KEY_TEST=$STRIPE_SECRET_KEY_TEST

ARG STRIPE_SECRET_KEY_LIVE
ENV STRIPE_SECRET_KEY_LIVE=$STRIPE_SECRET_KEY_LIVE

ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE

ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST

ARG STRIPE_WEBHOOK_SECRET_TEST
ENV STRIPE_WEBHOOK_SECRET_TEST=$STRIPE_WEBHOOK_SECRET_TEST

ARG STRIPE_WEBHOOK_SECRET_LIVE
ENV STRIPE_WEBHOOK_SECRET_LIVE=$STRIPE_WEBHOOK_SECRET_LIVE

ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY

ARG TURNSTILE_SECRET_KEY
ENV TURNSTILE_SECRET_KEY=$TURNSTILE_SECRET_KEY

ARG OPENAI_API_KEY
ENV OPENAI_API_KEY=$OPENAI_API_KEY

ARG OWNER_IDS_ARR
ENV OWNER_IDS_ARR=$OWNER_IDS_ARR

ARG DEVICE_ID_ENCRYPTION_KEY
ENV DEVICE_ID_ENCRYPTION_KEY=$DEVICE_ID_ENCRYPTION_KEY

ENV NODE_ENV=production
RUN pnpm build

# ---

FROM node:25-alpine

WORKDIR /srv/music

COPY --from=builder /srv/music/.next/standalone ./
COPY --from=builder /srv/music/.next/static ./.next/static
COPY --from=builder /srv/music/public ./public
# sharp (next/image for the covers): pnpm's .pnpm symlinks do not survive standalone tracing and --ignore-scripts
# skipped its native download above - so it is installed fresh with npm here and Next is pointed straight at it
RUN mkdir -p /tmp/sharp /srv/music/node_modules && cd /tmp/sharp && \
    npm init -y > /dev/null && \
    npm install sharp@latest --omit=dev && \
    rm -rf /srv/music/node_modules/sharp /srv/music/node_modules/@img && \
    cp -r node_modules/. /srv/music/node_modules/ && \
    rm -rf /tmp/sharp
# standalone server.js serves static from ./.next/static and public from ./public

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NEXT_SHARP_PATH=/srv/music/node_modules/sharp

# Coolify's own healthcheck runs `curl || wget`: alpine's wget stops at ::1 while Next listens on IPv4 only,
# curl walks on to 127.0.0.1 - same note as outreach-tool's image
RUN apk add --no-cache curl

EXPOSE 3000

CMD ["node", "server.js"]
