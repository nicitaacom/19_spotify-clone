export function createImpulseResponse(
  ctx: BaseAudioContext,
  seconds = 2.5,
  decay = 2.5,
): AudioBuffer {
  const length = Math.floor(seconds * ctx.sampleRate)
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
  const left = impulse.getChannelData(0)
  const right = impulse.getChannelData(1)

  for (let i = 0; i < length; i++) {
    const n = (1 - i / length) ** decay
    left[i] = (Math.random() * 2 - 1) * n
    right[i] = (Math.random() * 2 - 1) * n
  }

  return impulse
}
