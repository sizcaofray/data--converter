// app/api/server-session-key/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import crypto from 'crypto';

function getKey(): string {
  return (
    process.env.SERVER_SESSION_KEY ||
    process.env.NEXTAUTH_SECRET || // NextAuth를 쓴다면 대체 키로 사용
    ''
  );
}

export async function GET(): Promise<Response> {
  const key = getKey();
  if (!key) {
    return NextResponse.json(
      { ok: false, error: 'MISSING_SERVER_SESSION_KEY' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const digest = crypto.createHash('sha256').update(key).digest('hex');
  return NextResponse.json(
    { ok: true, digest },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
