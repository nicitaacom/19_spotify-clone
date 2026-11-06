import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import test from "node:test"

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/libs/errorText") {
      return nextResolve(new URL("../libs/errorText.ts", import.meta.url).href, context)
    }
    return nextResolve(specifier, context)
  },
})

const { audioFailureDetail, mediaErrorCode, probeAudioAddress, publicAudioAddress } = await import("../libs/audioFailureText.ts")

test("media error 2 is the browser network failure, not a bare number", () => {
  assert.equal(mediaErrorCode(2), 2)
  assert.equal(mediaErrorCode("4"), 4)
  assert.equal(mediaErrorCode({ code: 3 }), 3)
  assert.equal(mediaErrorCode(9), null)
  const detail = audioFailureDetail(2, {
    address: "https://supabase.music.jokik.fi/storage/v1/object/sign/songs/moulin.mp3",
    probe: "Audio file failed: HTTP 503. error code: 1102",
  })
  assert.match(detail, /media error 2/)
  assert.match(detail, /network error/)
  assert.match(detail, /1102/)
  assert.equal(detail.includes("Error: 2"), false)
})

test("a signed audio address drops the query before it is shown", () => {
  const shown = publicAudioAddress("https://supabase.music.jokik.fi/storage/v1/object/sign/songs/moulin.mp3?token=secret")
  assert.equal(shown, "https://supabase.music.jokik.fi/storage/v1/object/sign/songs/moulin.mp3")
})

test("a direct read keeps an error document and skips audio bytes", async () => {
  const html = await probeAudioAddress("https://music.example/song.mp3?token=secret", async () => new Response("error code: 1102", {
    status: 503,
    headers: { "content-type": "text/plain" },
  }))
  assert.match(html, /HTTP 503/)
  assert.match(html, /error code: 1102/)
  assert.equal(html.includes("token=secret"), false)

  const audio = await probeAudioAddress("https://music.example/song.mp3", async () => new Response(new Uint8Array([0, 1, 2]), {
    status: 206,
    headers: { "content-type": "audio/mpeg", "content-range": "bytes 0-2/9" },
  }))
  assert.match(audio, /HTTP 206 audio\/mpeg/)
  assert.equal(audio.includes("0,1,2"), false)
})
