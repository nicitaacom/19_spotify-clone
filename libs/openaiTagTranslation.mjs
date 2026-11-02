import { modelMessageText, translationsFromModel } from "./bilingualSongTags.mjs"

export const TAG_TRANSLATION_MODEL = "gpt-6-luna"
export const TAG_TRANSLATION_PROMPT = [
  "You add the other-language search tag for a music library.",
  "Each English tag needs one Russian search tag. Each Russian tag needs one English search tag.",
  'Return JSON {"pairs":[{"tag":"visualization","translation":"визуализация"}]}.',
  "tag must be copied from the list. translation uses the other alphabet.",
  "Keep game titles and short names, and add the Cyrillic spelling when people search for it.",
  "Translate slang to the ordinary word. Do not invent a music genre.",
  "Lowercase. Letters, numbers, spaces, hyphens, and underscores. 32 characters at most.",
  "Skip a translation that is already in the list.",
].join(" ")

export async function requestTagTranslations(tags) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error("OPENAI_API_KEY is missing.")
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TAG_TRANSLATION_MODEL,
      reasoning_effort: "none",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TAG_TRANSLATION_PROMPT },
        { role: "user", content: JSON.stringify({ tags }) },
      ],
    }),
  })
  const bodyText = await response.text()
  if (!response.ok) {
    throw new Error(`Tag translation failed. HTTP ${response.status}. ${bodyText.slice(0, 300)}`)
  }
  const parsed = JSON.parse(bodyText)
  const content = modelMessageText(parsed.choices?.[0]?.message?.content)
  try { return translationsFromModel(JSON.parse(content), tags) } catch { return [] }
}
