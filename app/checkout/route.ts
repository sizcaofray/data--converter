// app/api/checkout/route.ts

import { NextResponse } from 'next/server'
import Stripe from 'stripe'

// Stripe 비밀 키를 사용해 인스턴스 초기화
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

// ✅ [GET] 결제용 Stripe Checkout 세션 생성
export async function GET(request: Request) {
  try {
    // TODO: 로그인된 사용자의 UID를 세션 또는 쿠키에서 추출해야 안전
    const uid = 'temporary-uid' // 지금은 테스트용 하드코딩

    // Stripe Checkout 세션 생성
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      success_url: `${process.env.BASE_URL}/success`,
      cancel_url: `${process.env.BASE_URL}/cancel`,
      metadata: {
        uid, // Webhook에서 사용자 식별용
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Data Converter 유료 플랜',
            },
            unit_amount: 5000, // $50.00
          },
          quantity: 1,
        },
      ],
    })

    // 성공 시 결제 URL 반환
    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('❌ Stripe Checkout 세션 생성 오류:', error)
    return NextResponse.json({ error: '결제 생성 실패' }, { status: 500 })
  }
}
