// app/api/webhook/route.ts

import Stripe from 'stripe'
import { dbAdmin } from '@/lib/firebase-admin'

// Stripe 초기화
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

// Webhook 시그니처 검증용 키
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(req: Request) {
  const rawBody = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    // Stripe에서 보낸 Webhook을 검증
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    console.error('❌ Webhook 검증 실패:', err)
    return new Response('Webhook signature verification failed.', { status: 400 })
  }

  // ✅ 결제 완료 이벤트 처리
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const uid = session.metadata?.uid

    if (uid) {
      try {
        await dbAdmin.collection('users').doc(uid).set(
          { isPaid: true },
          { merge: true }
        )
        console.log(`✅ 결제 완료 → UID: ${uid}, isPaid=true 업데이트됨`)
      } catch (err) {
        console.error('❌ Firestore 업데이트 실패:', err)
      }
    }
  }

  return new Response('Webhook received', { status: 200 })
}
