// app/api/bootpay-webhook/route.ts

import { NextRequest } from 'next/server'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp, cert, getApps } from 'firebase-admin/app'

// 🔐 Firebase Admin 초기화
if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

const db = getFirestore()

// ✅ Bootpay Webhook 엔드포인트
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const receipt_id = body?.receipt_id
    const user_id = body?.user_id

    if (!receipt_id || !user_id) {
      return new Response('Missing receipt_id or user_id', { status: 400 })
    }

    console.log('✅ Webhook 수신:', { user_id, receipt_id })

    // Firestore에서 해당 사용자 문서 업데이트
    await db.collection('users').doc(user_id).set(
      {
        isPaid: true,
        paidAt: new Date(),
        receiptId: receipt_id,
      },
      { merge: true }
    )

    return new Response('Webhook success', { status: 200 })
  } catch (err) {
    console.error('❌ Webhook 처리 실패:', err)
    return new Response('Webhook error', { status: 500 })
  }
}
