import { createHmac } from "node:crypto"

const DEVICE_ID_KEY_PATTERN = /^[0-9a-f]{64}$/i
const SIGNING_KEY_LABEL = "device-id-signature"

let encryptionKey: Buffer | null = null
let signingKey: Buffer | null = null

/**
 * The 32 raw bytes behind DEVICE_ID_ENCRYPTION_KEY, used by `deviceIdCookie.ts` for aes-256-gcm.
 * Read on first use, not at import: the visit-tracking action module is imported while the root
 * layout renders, so a missing env var here stops visit tracking alone and every page still renders.
 */
export function getDeviceIdEncryptionKey(): Buffer {
  if (encryptionKey) return encryptionKey

  const keyHex = process.env.DEVICE_ID_ENCRYPTION_KEY
  if (!keyHex || !DEVICE_ID_KEY_PATTERN.test(keyHex))
    throw Error(
      "DEVICE_ID_ENCRYPTION_KEY must hold 64 hex characters (32 bytes) - generate one with `openssl rand -hex 32`",
    )

  encryptionKey = Buffer.from(keyHex, "hex")
  return encryptionKey
}

/**
 * The key the deviceId check is derived with. Derived from the encryption key through its own HMAC
 * rather than being a second env var, so the encrypting use and the signing use never share raw
 * key material.
 */
export function getDeviceIdSigningKey(): Buffer {
  if (signingKey) return signingKey

  signingKey = createHmac("sha256", getDeviceIdEncryptionKey()).update(SIGNING_KEY_LABEL).digest()
  return signingKey
}
