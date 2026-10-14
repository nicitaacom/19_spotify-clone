/** Shared vocabulary: keep the identical file in the music and image apps. */
export const tagGroups = Object.freeze({
  time: ["day", "night", "morning", "midday", "afternoon", "evening", "twilight", "sunrise", "sunset", "dawn", "dusk"],
  season: ["winter", "autumn", "spring", "summer"],
  weather: ["sunny", "clear", "partly-cloudy", "cloudy", "overcast", "rainy", "drizzle", "snowy", "blizzard", "stormy", "foggy", "misty", "freezing-fog", "freezing-rain", "sleet", "hail", "windy", "hazy", "dusty", "smoky", "tornado"],
  temperature: ["cold", "freezing", "extra-cold", "ultra-cold", "mild", "warm", "hot", "extra-hot", "ultra-hot"],
  lighting: ["bright", "dark", "golden", "moonlight"],
  vibe: ["vibe", "cozy", "lofi", "candle", "fireplace", "reading", "sweater", "cabin", "lazy", "relaxing"],
  mood: ["sad", "happy", "energy", "slow", "fast", "calm", "dreamy", "upbeat", "love", "romantic", "cinematic", "spooky", "festive"],
  genre: ["hip-hop", "pop", "rock", "metal", "drum-and-bass", "lofi", "ambient", "acoustic", "piano", "jazz", "classical", "blues", "country", "dance", "disco", "dubstep", "electronic", "house", "techno", "trance", "edm", "rnb", "reggae", "soul", "punk", "funk", "folk", "indie", "gospel", "soundtrack", "latin", "synthwave", "afrobeats", "hard-rock", "chill"],
  theme: ["halloween", "new-year", "love", "food", "enterprise", "it-worked", "gray-3d-small-dot"],
})
export const tagAliases = Object.freeze({
  authumn: "autumn", fall: "autumn", cosy: "cozy", "lo-fi": "lofi", "lo fi": "lofi",
  hiphop: "hip-hop", "hip hop": "hip-hop", metall: "metal", "heavy metal": "metal",
  "drum&base": "drum-and-bass", "drum&bass": "drum-and-bass", "drum & bass": "drum-and-bass", "drum & base": "drum-and-bass",
  "drum and base": "drum-and-bass", "drum and bass": "drum-and-bass", "drum n bass": "drum-and-bass", dnb: "drum-and-bass", "d&b": "drum-and-bass",
  "r&b": "rnb", "r and b": "rnb", "rhythm and blues": "rnb", "hard rock": "hard-rock",
  rain: "rainy", snow: "snowy", sun: "sunny", wind: "windy", storm: "stormy", fog: "foggy", mist: "misty",
  noon: "midday", "mid-day": "midday", energetic: "energy",
})
export function canonicalTag(value) {
  const normalized = value.trim().normalize("NFC").toLowerCase().replace(/\s+/g, " ")
  return Object.hasOwn(tagAliases, normalized) ? tagAliases[normalized] : normalized
}
export function normalizeTagList(value, maximum = 32) {
  if (!Array.isArray(value) || value.length > maximum * 4) throw new Error(`Use up to ${maximum} tags.`)
  const tags = []
  for (const entry of value) {
    if (typeof entry !== "string") throw new Error("Each tag must be text.")
    const tag = canonicalTag(entry)
    if (!tag) continue
    if (tag.length > 32 || !/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(tag)) throw new Error("Tags can use letters, numbers, spaces, hyphens and underscores, up to 32 characters.")
    if (!tags.includes(tag)) tags.push(tag)
    if (tags.length > maximum) throw new Error(`Use up to ${maximum} tags.`)
  }
  return tags
}
const words = value => value.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
/** Whole words/phrases only: "hip-hop", "HIPHOP" and "hip hop" resolve alike. */
export function inferPlaylistGenreTags(...names) {
  const title = ` ${words(names.filter(value => typeof value === "string").join(" "))} `
  const aliases = [...tagGroups.genre.map(tag => [tag, tag]), ...Object.entries(tagAliases).filter(([, tag]) => tagGroups.genre.includes(tag))]
  return [...new Set(aliases.filter(([alias]) => title.includes(` ${words(alias)} `)).map(([, tag]) => tag))]
}
