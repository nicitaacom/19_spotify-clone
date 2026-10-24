export function embedFrameCode(origin: string, songId: string) {
  const src = `${origin}/embed?songId=${encodeURIComponent(songId)}`
  return `<iframe src="${src}" title="Music recommendation" style="position:fixed;right:16px;bottom:16px;width:420px;height:160px;border:0;background:transparent;color-scheme:dark;z-index:999999"></iframe>`
}
