import { Price } from "@/types"

export const postData = async ({ url, data }: { url: string; data?: { price: Price } }) => {
  console.log("POST REQUEST", url, data)

  const res: Response = await fetch(url, {
    method: "POST",
    headers: new Headers({ "Content-Type": "application/json" }),
    credentials: "same-origin",
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    console.log("Error in POST", { url, data, res })

    throw new Error(res.statusText)
  }

  return res.json()
}

export const toDateTime = (secs: number) => {
  var t = new Date("1970-01-01T00:30:00Z")
  t.setSeconds(secs)
  return t
}

const CYRILLIC_TO_LATIN_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "i",
  ь: "",
  э: "e",
  ю: "iu",
  я: "ia",
  і: "i",
  ї: "i",
  є: "e",
  ґ: "g",
}

export const slugifyFilePart = (value: string) => {
  const transliterated = value
    .trim()
    .toLowerCase()
    .split("")
    .map(char => CYRILLIC_TO_LATIN_MAP[char] ?? char)
    .join("")

  const normalized = transliterated.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  const slug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")

  return slug || "file"
}

export const getSafeStoragePath = ({ prefix, value, uniqueId, fileName }: { prefix: string; value: string; uniqueId: string; fileName?: string }) => {
  const extension = fileName?.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "")
  const safeValue = slugifyFilePart(value)

  if (!extension || extension === fileName?.toLowerCase()) {
    return `${prefix}-${safeValue}-${uniqueId}`
  }

  return `${prefix}-${safeValue}-${uniqueId}.${extension}`
}
