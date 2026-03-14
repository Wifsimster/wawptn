import crypto from 'crypto'
import { env } from '../../config/env.js'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const PREFIX = 'enc:'

function deriveKey(): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', env.APP_SECRET, 'wawptn-token-encryption', '', 32)
  )
}

export function encryptToken(plaintext: string): string {
  const key = deriveKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${PREFIX}${iv.toString('base64')}.${encrypted.toString('base64')}.${tag.toString('base64')}`
}

export function decryptToken(ciphertext: string): string {
  if (!ciphertext.startsWith(PREFIX)) {
    return ciphertext
  }

  const parts = ciphertext.slice(PREFIX.length).split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format')
  }

  const key = deriveKey()
  const iv = Buffer.from(parts[0]!, 'base64')
  const encrypted = Buffer.from(parts[1]!, 'base64')
  const tag = Buffer.from(parts[2]!, 'base64')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
