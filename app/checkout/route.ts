// app/checkout/route.ts
export const runtime = 'nodejs'; // Stripe/Admin은 Edge에서 작동 X

import Stripe from 'stripe';
import { NextResponse } from 'next/server';

function getStripe() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error(
      'Missing STRIPE_SECRET_KEY (Vercel → Project → Settings → Environment Variables)'
    );
  }
  // ✅ apiVersion 옵션 제거: 설치된 SDK 타입과 자동 정합
  return new Stripe(secret);
}

// 예시: Checkout 세션 생성 (GET/POST 중 프로젝트 규칙에 맞게 사용)
export async function GET() {
  try {
    const stripe = getStripe();
    // TODO: 실제 상품/가격/성공/취소 URL은 프로젝트에 맞게 채우세요.
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: 'price_xxx', quantity: 1 }],
      success_url: 'https://data--converter.vercel.app/success',
      cancel_url: 'https://data--converter.vercel.app/cancel',
    });
    return NextResponse.json({ id: session.id, url: session.url });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
