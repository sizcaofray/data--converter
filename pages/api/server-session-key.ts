// 📄 pages/api/server-session-key.ts

import { NextResponse } from 'next/server';

export async function GET() {
  const serverKey = process.env.SERVER_SESSION_KEY || 'dev-default';
  return new NextResponse(serverKey, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}
