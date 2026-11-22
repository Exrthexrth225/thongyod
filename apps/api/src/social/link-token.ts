import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function key(): Buffer {
  const value = process.env.APP_ENCRYPTION_KEY ?? ''
  const decoded = Buffer.from(value, 'base64')
  if (decoded.length !== 32 || decoded.toString('base64') !== value) throw new Error('Encryption key unavailable')
  return decoded
}

export const linkHash = (token: string) => createHash('sha256').update(token).digest('hex')

export function encryptLink(token: string, context: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  cipher.setAAD(Buffer.from(context))
  const content = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return 'v1.' + Buffer.concat([iv, cipher.getAuthTag(), content]).toString('base64url')
}

export function decryptLink(value: string, context: string): string {
  if (!/^v1\.[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encrypted link')
  const data = Buffer.from(value.slice(3), 'base64url')
  if (data.length < 29) throw new Error('Invalid encrypted link')
  const decipher = createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12))
  decipher.setAAD(Buffer.from(context))
  decipher.setAuthTag(data.subarray(12, 28))
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8')
}
