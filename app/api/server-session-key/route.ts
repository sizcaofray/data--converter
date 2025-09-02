// pages/api/server-session-key.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const key =
      process.env.SERVER_SESSION_KEY ||
      process.env.NEXTAUTH_SECRET || // NextAuth를 쓰면 이걸 대체 키로 사용
      '';

    if (!key) {
      res.status(500).json({ ok: false, error: 'MISSING_SERVER_SESSION_KEY' });
      return;
    }

    const digest = crypto.createHash('sha256').update(key).digest('hex');

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({ ok: true, digest });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
