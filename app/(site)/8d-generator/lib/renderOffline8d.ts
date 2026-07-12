import { build8dGraph, EightDParams } from "./build8dGraph"

/**
 * Renders the static 8-channel 8D mix offline to a stereo AudioBuffer, identical to
 * live playback. Output length == input length. Output is always stereo — HRTF renders
 * binaural stereo regardless of source channel count.
 */
export async function renderOffline8d(
  buffer: AudioBuffer,
  params: EightDParams,
): Promise<AudioBuffer> {
  const length = Math.ceil(buffer.duration * buffer.sampleRate)
  const offCtx = new OfflineAudioContext(2, length, buffer.sampleRate)

  const graph = build8dGraph(offCtx, buffer, params)
  graph.source.start(0)

  return offCtx.startRendering()
}
