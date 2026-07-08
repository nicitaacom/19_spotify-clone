"use client"

interface AlbumArtProps {
  albumArtUrl: string | null
  pitchEnabled: boolean
  pitchSemitones: number
}

export default function AlbumArt({ albumArtUrl, pitchEnabled, pitchSemitones }: AlbumArtProps) {
  if (!albumArtUrl) return null

  const shouldAnimate = pitchEnabled && pitchSemitones <= -1

  // §12.10.C — album art brightness is 1.5× more sensitive to the dim than the
  // site background. dim = st/12; negative slope 0.9, positive slope 0.15.
  const dim = pitchEnabled ? pitchSemitones / 12 : 0
  const brightness = dim < 0 ? 1 + dim * 0.9 : 1 + dim * 0.15

  return (
    <div className="flex justify-center">
      <div className="w-28 h-28 rounded-xl border border-white/5 overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={albumArtUrl}
          alt="Album art"
          className={`w-full h-full object-cover ${shouldAnimate ? "animate-kenburns" : ""}`}
          style={{ filter: `brightness(${brightness})`, transition: "filter 300ms" }}
        />
      </div>
    </div>
  )
}
