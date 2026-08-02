import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

import { getDeviceIdEncryptionKey } from "./deviceIdKeys"

/**
 * Layer 2 of the visitor identity - an httpOnly cookie holding the deviceId, so a script clearing
 * localStorage leaves the identity intact. The value is aes-256-gcm over the deviceId, packed as
 * `iv | authTag | ciphertext` in base64url: the cookie is the one layer a visitor pulls off their own
 * machine and hand-edits, and `decryptDeviceId` returns null on a bad auth tag, so a tampered value
 * falls through to layer 3 instead of reaching `utm_stats`.
 */
export const DEVICE_ID_COOKIE_NAME = "19_did"

const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export function encryptDeviceId(deviceId: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv("aes-256-gcm", getDeviceIdEncryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(deviceId, "utf8"), cipher.final()])

  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url")
}

export function decryptDeviceId(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null

  try {
    const packed = Buffer.from(cookieValue, "base64url")
    if (packed.length <= IV_LENGTH + AUTH_TAG_LENGTH) return null

    const decipher = createDecipheriv("aes-256-gcm", getDeviceIdEncryptionKey(), packed.subarray(0, IV_LENGTH))
    decipher.setAuthTag(packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH))

    const deviceId = Buffer.concat([decipher.update(packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH)), decipher.final()])

    return deviceId.toString("utf8")
  } catch {
    return null
  }
}
