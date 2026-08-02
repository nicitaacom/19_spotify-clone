import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

import { getDeviceIdSigningKey } from "./deviceIdKeys"

/**
 * A deviceId looks like `19-Xk29vBq7mTz4LpR8nWc1s-7QF3KMBH`:
 *
 *   19-Xk29vBq7mTz4LpR8nWc1s-7QF3KMBH
 *   ^^ ^^^^^^^^^^^^^^^^^^^^^ ^^^^^^^^
 *   |  body: 21 random chars  check: 8 chars of Crockford base32, each one a byte of
 *   |  of [0-9a-zA-Z]         HMAC-SHA256(signing key, body) mod 32
 *   project prefix
 *
 * The check is what makes an id say "this server minted me". Layer 1 (localStorage) is the one layer
 * a visitor edits with their own devtools, and its value becomes `utm_stats.user_id` - without the
 * check, typing `19-whatever` there was enough to invent visitors or write rows under someone
 * else's id. Deriving the check takes one HMAC with the signing key; without the key the only route
 * is trying all 32^8 combinations.
 */
const DEVICE_ID_PREFIX = "19-"
const BODY_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
const CHECK_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const BODY_LENGTH = 21
const CHECK_LENGTH = 8
const DEVICE_ID_PATTERN = /^19-([0-9a-zA-Z]{21})-([0-9ABCDEFGHJKMNPQRSTVWXYZ]{8})$/

/**
 * Transport form - the only shape localStorage and the browser ever see. The check rejects a
 * hand-typed id, but on its own it leaves the shape on display: open devtools, see
 * `19-<21 chars>-<8 chars>`, and you know what the server expects. So every character steps 3
 * places back through this 63-character alphabet and the whole string is then reversed. `-` sits at
 * index 62, so the character that lands on it is whatever was at index 2 ("2") and the real
 * separators step elsewhere - nothing in the stored value marks where prefix, body and check begin.
 *
 * The step and the reversal are a fixed pair: they hide the structure, they are not what makes an id
 * unforgeable. The keyed check is still the thing that accepts or rejects.
 */
const TRANSPORT_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-"
const TRANSPORT_STEP = 3

// Bytes past the last whole multiple of the alphabet length are drawn again, so every character of
// the body stays equally likely instead of the first 8 characters coming up slightly more often.
function getRandomBodyCharacter(): string {
  const highestWholeMultiple = 256 - (256 % BODY_ALPHABET.length)
  let byte = randomBytes(1)[0]
  while (byte >= highestWholeMultiple) byte = randomBytes(1)[0]

  return BODY_ALPHABET[byte % BODY_ALPHABET.length]
}

function getDeviceIdCheck(body: string): string {
  const signature = createHmac("sha256", getDeviceIdSigningKey()).update(body).digest()

  return Array.from(signature.subarray(0, CHECK_LENGTH), byte => CHECK_ALPHABET[byte % CHECK_ALPHABET.length]).join("")
}

function stepTransportCharacter(character: string, step: number): string {
  const index = TRANSPORT_ALPHABET.indexOf(character)
  if (index === -1) return character

  return TRANSPORT_ALPHABET[(index + step + TRANSPORT_ALPHABET.length) % TRANSPORT_ALPHABET.length]
}

/** Mints a new signed deviceId - the last resort when all 4 identity layers missed. */
export function createDeviceId(): string {
  const body = Array.from({ length: BODY_LENGTH }, getRandomBodyCharacter).join("")

  return `${DEVICE_ID_PREFIX}${body}-${getDeviceIdCheck(body)}`
}

/**
 * Re-derives the check from the body it was handed and compares with `timingSafeEqual`, so a
 * hand-typed id is rejected and the visit falls through to layers 2-4 as though localStorage had
 * been empty. Every deviceId is checked, not only layer 1's - the cookie and Redis values pass by
 * construction, and running them through as well is what retires older unsigned ids.
 */
export function isValidDeviceId(deviceId: string): boolean {
  const deviceIdParts = DEVICE_ID_PATTERN.exec(deviceId)
  if (!deviceIdParts) return false

  const expectedCheck = Buffer.from(getDeviceIdCheck(deviceIdParts[1]))
  const sentCheck = Buffer.from(deviceIdParts[2])

  return expectedCheck.length === sentCheck.length && timingSafeEqual(expectedCheck, sentCheck)
}

/** Signed id -> transport form. The signed id itself never reaches the browser. */
export function encodeDeviceId(deviceId: string): string {
  return Array.from(deviceId, character => stepTransportCharacter(character, -TRANSPORT_STEP))
    .reverse()
    .join("")
}

/** Transport form -> signed id. Returns null when the value holds a character the alphabet has no place for. */
export function decodeDeviceId(storedDeviceId: string): string | null {
  const decodedCharacters: string[] = []

  for (const character of Array.from(storedDeviceId).reverse()) {
    if (TRANSPORT_ALPHABET.indexOf(character) === -1) return null
    decodedCharacters.push(stepTransportCharacter(character, TRANSPORT_STEP))
  }

  return decodedCharacters.join("")
}
