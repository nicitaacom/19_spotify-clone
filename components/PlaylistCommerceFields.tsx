"use client"

import Input from "@/components/Input"

interface Props {
  price: string
  youtube: string
  onPrice: (value: string) => void
  onYoutube: (value: string) => void
  disabled?: boolean
}

export default function PlaylistCommerceFields({ price, youtube, onPrice, onYoutube, disabled }: Props) {
  return (
    <fieldset disabled={disabled} className="space-y-4 rounded-xl border border-neon/15 bg-neon/5 p-4">
      <legend className="px-2 text-sm font-medium text-neon">Playlist access</legend>
      <label className="block space-y-2 text-sm text-neutral-300">
        <span>One-time price (USD)</span>
        <Input
          type="number"
          required
          min="1"
          max="10"
          step="0.01"
          value={price}
          onChange={e => onPrice(e.target.value)}
        />
        <span className="block text-xs text-neutral-400">
          $1–$10. Future additions are included for existing buyers.
        </span>
      </label>
      <label className="block space-y-2 text-sm text-neutral-300">
        <span>
          YouTube playlist link <span className="text-neon">*</span>
        </span>
        <Input
          type="url"
          required
          value={youtube}
          onChange={e => onYoutube(e.target.value)}
          placeholder="https://www.youtube.com/playlist?list=…"
        />
        <span className="block text-xs leading-5 text-neutral-400">
          Required. Revealed after purchase; buyers are welcome to share it.
        </span>
      </label>
    </fieldset>
  )
}
