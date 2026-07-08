import { buildEffectsGraph, EffectsParams } from "./buildEffectsGraph"

export async function renderOffline(
  buffer: AudioBuffer,
  params: EffectsParams,
): Promise<AudioBuffer> {
  const tail = params.reverb > 0 ? 2.5 : 0
  const outDuration = buffer.duration / params.speed + tail
  const length = Math.ceil(outDuration * buffer.sampleRate)

  const offlineCtx = new OfflineAudioContext(2, length, buffer.sampleRate)

  const { source } = buildEffectsGraph(offlineCtx, buffer, params)
  source.start(0)

  const rendered = await offlineCtx.startRendering()
  return rendered
}
