import assert from "node:assert/strict"
import { execFile as execFileCallback, spawn } from "node:child_process"
import { createServer } from "node:http"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { createReadStream, createWriteStream } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import test from "node:test"
import { parseBuffer } from "music-metadata"
import { MPEGDecoder } from "mpg123-decoder"

const execFile = promisify(execFileCallback)

test("long M4A upload uses real incremental browser decoding and creates audible MP3 form data", { timeout: 1800000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "song-upload-test-"))
  const sourcePath = process.env.SONG_UPLOAD_TEST_FILE || process.env.SONG_UPLOAD_FIXTURE_FILE || new URL("./fixtures/song-upload.m4a", import.meta.url)
  const original = Boolean(process.env.SONG_UPLOAD_TEST_FILE)
  let server
  let browser
  try {
    await execFile("pnpm", ["exec", "esbuild", "libs/songUpload.ts", "--bundle", "--platform=browser", "--format=iife", "--global-name=Upload", `--outfile=${join(dir, "bundle.js")}`])
    const bundle = await readFile(join(dir, "bundle.js"))
    const html = `<!doctype html><body>pending<script src="/bundle.js"></script><script>
window.runUploadTest = async () => {
  try {
    const bytes = await (await fetch('/fixture.m4a')).arrayBuffer();
    let nativeDecoded = null;
    if (!${original}) {
      const context = new OfflineAudioContext(2, 1, 44100);
      nativeDecoded = (await context.decodeAudioData(bytes.slice(0))).duration;
    }
    class CheckedFile extends File {
      // Exercise oversized-file conversion using the small audio fixture.
      get size() { return Math.max(super.size, 50 * 1024 * 1024 + 1); }
      arrayBuffer() { throw new Error('whole-file read'); }
      slice(start, end, type) {
        if (end - start > 256 * 1024) throw new Error('oversized read');
        return super.slice(start, end, type);
      }
    }
    window.OfflineAudioContext = class { decodeAudioData() { throw new Error('whole-file decode'); } };
    const source = new CheckedFile([bytes], 'song.m4a', {type:'audio/mp4'});
    const progress = [];
    const result = await Upload.prepareSongUpload(source, 3601, p => progress.push(p));
    const form = new FormData(); form.append('song', result);
    const stored = form.get('song');
    const response = await fetch('/output.mp3', {method:'POST', body:form});
    if (!response.ok) throw new Error('upload failed');
    let truncated;
    try { await Upload.prepareSongUpload(new CheckedFile([bytes.slice(0, 32)], 'broken.m4a'), 3601); } catch (error) { truncated = String(error); }
    const realDecoder = window.AudioDecoder;
    delete window.AudioDecoder;
    let unsupported;
    try { await Upload.prepareSongUpload(source, 3601); } catch (error) { unsupported = String(error); }
    window.AudioDecoder = realDecoder;
    return {name:stored.name,type:stored.type,progress,size:stored.size,unsupported,truncated,nativeDecoded};
  } catch (e) { return {error:String(e), stack:e.stack}; }
};</script></body>`
    server = createServer((req, res) => {
      if (req.url === "/bundle.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(bundle) }
      else if (req.url === "/fixture.m4a") { res.writeHead(200, { "Content-Type": "audio/mp4" }); createReadStream(sourcePath).pipe(res) }
      else if (req.url === "/output.mp3" && req.method === "POST") {
        // The multipart request is parsed by the browser's FormData implementation;
        // retain its one file body for independent MP3 validation below.
        const chunks = []
        req.on("data", chunk => chunks.push(chunk))
        req.on("end", () => {
          const body = Buffer.concat(chunks)
          const start = body.indexOf("\r\n\r\n") + 4
          const end = body.lastIndexOf("\r\n--")
          const output = createWriteStream(join(dir, "output.mp3"))
          output.end(body.subarray(start, end), () => res.end("ok"))
        })
      }
      else { res.writeHead(200, { "Content-Type": "text/html" }); res.end(html) }
    })
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
    const port = server.address().port
    const profile = join(dir, "profile")
    browser = spawn(process.env.CHROME_BIN || "/usr/bin/google-chrome", ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank"], { stdio: "ignore" })
    let debugPort
    for (let attempt = 0; attempt < 100; attempt++) {
      try { debugPort = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); break } catch { await new Promise(resolve => setTimeout(resolve, 100)) }
    }
    assert.ok(debugPort, "browser did not start")
    const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?http://127.0.0.1:${port}/`, { method: "PUT" })).json()
    const socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
    let id = 0
    const pending = new Map()
    socket.onmessage = event => {
      const message = JSON.parse(event.data)
      const resolve = pending.get(message.id)
      if (resolve) { resolve(message); pending.delete(message.id) }
    }
    const evaluate = expression => new Promise(resolve => {
      const requestId = ++id
      pending.set(requestId, resolve)
      socket.send(JSON.stringify({ id: requestId, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }))
    })
    let response
    for (let attempt = 0; attempt < 100; attempt++) {
      response = await evaluate("typeof window.runUploadTest")
      if (response.result?.result?.value === "function") break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    response = await evaluate("window.runUploadTest()")
    socket.close()
    assert.ok(response.result, JSON.stringify(response))
    const result = response.result.result.value
    assert.equal(result.error, undefined, result.stack || result.error)
    assert.match(result.unsupported, /does not support streaming M4A decoding/)
    assert.match(result.truncated, /Could not convert "broken\.m4a"/)
    assert.equal(result.name, "song.mp3")
    assert.equal(result.type, "audio/mpeg")
    assert.equal(result.progress[0], 0)
    assert.equal(result.progress.at(-1), 100)
    const data = await readFile(join(dir, "output.mp3"))
    assert.equal(result.size, data.length)
    assert.ok(data.length <= 50 * 1024 * 1024)
    if (original) {
      const { stdout } = await execFile("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=bit_rate,codec_name", "-of", "json", join(dir, "output.mp3")])
      const info = JSON.parse(stdout)
      assert.equal(info.streams[0].codec_name, "mp3")
      assert.equal(Number(info.streams[0].bit_rate), 112000)
      assert.ok(Math.abs(Number(info.format.duration) - 3601.043) < 1)
      const { stdout: pcm } = await execFile("ffmpeg", ["-v", "error", "-ss", "1800", "-i", join(dir, "output.mp3"), "-t", "1", "-ac", "1", "-f", "f32le", "pipe:1"], { encoding: "buffer", maxBuffer: 1024 * 1024 })
      let energy = 0
      for (let i = 0; i + 4 <= pcm.length; i += 4) energy += pcm.readFloatLE(i) ** 2
      assert.ok(Math.sqrt(energy / (pcm.length / 4)) > 0.001, "midpoint of original recording must remain audible")
      return
    }
    assert.ok(result.nativeDecoded > 0.9 && result.nativeDecoded < 1.2)
    const metadata = await parseBuffer(data, "audio/mpeg")
    assert.equal(metadata.format.bitrate, 112000)
    assert.ok(Math.abs(metadata.format.duration - 1) < 0.15)
    const decoder = new MPEGDecoder()
    await decoder.ready
    try {
      const audio = decoder.decode(data)
      const samples = audio.channelData[0]
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
      assert.ok(rms > 0.03, `decoded MP3 must contain the tone: ${rms}`)
    } finally { decoder.free() }
  } finally {
    if (browser) { browser.kill(); await new Promise(resolve => browser.once("exit", resolve)) }
    if (server) await new Promise(resolve => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }
})
