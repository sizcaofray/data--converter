// app/api/webhook/route.ts
export const runtime = 'nodejs'; // Stripe/Admin은 Edge에서 동작하지 않음

import Stripe from 'stripe';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      return NextResponse.json(
        { error: 'Missing STRIPE_SECRET_KEY (Vercel → Settings → Environment Variables)' },
        { status: 500 }
      );
    }

    // ✅ apiVersion 옵션을 제거하여 SDK의 기본(패키지에 맞는) 버전을 사용
    const stripe = new Stripe(secret);

    // TODO: webhook 본문 처리/검증 로직을 여기에 작성
    // const raw = await req.text();
    // const sig = req.headers.get('stripe-signature') ?? '';
    // const event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET!);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
