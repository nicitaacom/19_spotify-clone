import { requireUser } from "../requireUser"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Fixed-size payload for measuring real client download throughput. Generated
// once at module load and reused across requests — content doesn't matter,
// only size and the fact that it can't be served from cache.
const SPEED_TEST_PAYLOAD = Buffer.alloc(2 * 1024 * 1024)

// GET /api/backup/speed-test → raw bytes, timed by the client to estimate bytesPerMs
export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  return new Response(SPEED_TEST_PAYLOAD, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(SPEED_TEST_PAYLOAD.length),
      "Cache-Control": "no-store",
    },
  })
}
