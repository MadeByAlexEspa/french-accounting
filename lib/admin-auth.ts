import crypto from 'crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'admin_session'

function getCode(): string {
  const code = process.env.ADMIN_CODE
  if (!code) throw new Error('ADMIN_CODE manquant')
  return code
}

function createToken(): string {
  const payload = JSON.stringify({
    admin: true,
    exp: Date.now() + 8 * 60 * 60 * 1000,
  })
  const sig = crypto.createHmac('sha256', getCode()).update(payload).digest('hex')
  return Buffer.from(payload).toString('base64') + '.' + sig
}

function verifyToken(token: string): boolean {
  try {
    const dotIndex = token.indexOf('.')
    if (dotIndex === -1) return false
    const b64 = token.slice(0, dotIndex)
    const sig = token.slice(dotIndex + 1)
    const payload = Buffer.from(b64, 'base64').toString()
    const expectedSig = crypto.createHmac('sha256', getCode()).update(payload).digest('hex')
    // Timing-safe comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
      return false
    }
    const data: unknown = JSON.parse(payload)
    if (typeof data !== 'object' || data === null) return false
    const d = data as Record<string, unknown>
    if (typeof d.exp !== 'number' || d.exp < Date.now()) return false
    return d.admin === true
  } catch {
    return false
  }
}

export async function signAdminToken(): Promise<string> {
  return createToken()
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  return verifyToken(token)
}

export async function getAdminSession(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return false
  return verifyToken(token)
}

export { COOKIE_NAME }
