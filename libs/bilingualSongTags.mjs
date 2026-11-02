const letterScripts = tag => ({
  cyr: /\p{Script=Cyrillic}/u.test(tag),
  lat: /\p{Script=Latin}/u.test(tag),
})

export function otherScript(tag, translation) {
  const from = letterScripts(tag)
  const to = letterScripts(translation)
  if (from.cyr === from.lat || to.cyr === to.lat) return false
  return from.cyr !== to.cyr
}

export function translationsFromModel(body, tags) {
  const pairs = body && typeof body === "object" && Array.isArray(body.pairs) ? body.pairs : []
  const known = new Set(tags)
  const added = []
  for (const pair of pairs) {
    if (!pair || typeof pair.tag !== "string" || typeof pair.translation !== "string") continue
    if (!known.has(pair.tag) || !otherScript(pair.tag, pair.translation)) continue
    added.push(pair.translation)
  }
  return added
}

export function mergeBilingualTags(tags, added, acceptTag, maximum = 32) {
  const next = [...tags]
  for (const item of added) {
    if (next.length >= maximum) break
    const tag = acceptTag(item)
    if (typeof tag === "string" && tag && !next.includes(tag)) next.push(tag)
  }
  return next
}

export function modelMessageText(content) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content.map(part => {
    if (typeof part === "string") return part
    if (part && typeof part === "object" && typeof part.text === "string") return part.text
    return ""
  }).join("")
}
