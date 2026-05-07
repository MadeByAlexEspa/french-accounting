import { NextRequest, NextResponse } from 'next/server'
import { signAdminToken, verifyAdminToken, COOKIE_NAME } from '@/lib/admin-auth'

export async function POST(req: NextRequest) {
  const body: unknown = await req.json()
  if (typeof body !== 'object' || body === null || !('code' in body)) {
    return NextResponse.json({ error: 'Code incorrect' }, { status: 401 })
  }
  const { code } = body as { code: unknown }
  if (typeof code !== 'string' || code !== process.env.ADMIN_CODE) {
    return NextResponse.json({ error: 'Code incorrect' }, { status: 401 })
  }
  const token = await signAdminToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60,
    path: '/',
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
  return res
}

// Vérifie la session courante (utilisé par le frontend admin)
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ authenticated: false })
  const valid = await verifyAdminToken(token)
  return NextResponse.json({ authenticated: valid })
}
