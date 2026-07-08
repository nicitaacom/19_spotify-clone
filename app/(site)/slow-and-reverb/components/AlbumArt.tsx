"use client"

interface AlbumArtProps {
  albumArtUrl: string | null
  pitchEnabled: boolean
  pitchSemitones: number
}

export default function AlbumArt({ albumArtUrl, pitchEnabled, pitchSemitones }: AlbumArtProps) {
  if (!albumArtUrl) return null

  const shouldAnimate = pitchEnabled && pitchSemitones <= -1

  return (
    <div className="absolute right-6 top-6 hidden md:block">
      <div className="w-28 h-28 rounded-xl border border-white/5 overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
        <img
          src={albumArtUrl}
          alt="Album art"
          className={`w-full h-full object-cover ${shouldAnimate ? "animate-kenburns" : ""}`}
        />
      </div>
    </div>
  )
}
