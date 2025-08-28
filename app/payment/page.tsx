'use client'

import { useEffect, useState } from 'react'
import { getAuth } from 'firebase/auth'

declare global {
  interface Window {
    Bootpay: any
  }
}

export default function PaymentPage() {
  const [sdkReady, setSdkReady] = useState(false)
  const [userId, setUserId] = useState('')
  const [userEmail, setUserEmail] = useState('')

  // ✅ Bootpay SDK 로딩 + window.Bootpay 존재 감지까지 포함
  useEffect(() => {
    const loadScript = () => {
      const script = document.createElement('script')
      script.src = 'https://cdn.bootpay.co.kr/js/bootpay-3.3.6.min.js'
      script.id = 'bootpay-sdk'
      script.async = true
      script.onload = () => {
        console.log('✅ Bootpay SDK 삽입 완료 → Bootpay 객체 대기 중...')
        waitForBootpay()
      }
      script.onerror = () => {
        console.error('❌ Bootpay SDK 로딩 실패')
      }
      document.body.appendChild(script)
    }

    const waitForBootpay = () => {
      const check = setInterval(() => {
        if (typeof window.Bootpay !== 'undefined') {
          clearInterval(check)
          console.log('✅ window.Bootpay 인식됨')
          setSdkReady(true)
        }
      }, 100) // 100ms 간격으로 확인
    }

    if (typeof window !== 'undefined' && !document.getElementById('bootpay-sdk')) {
      loadScript()
    } else if (typeof window.Bootpay !== 'undefined') {
      setSdkReady(true)
    }
  }, [])

  useEffect(() => {
    const user = getAuth().currentUser
    if (user) {
      setUserId(user.uid)
      setUserEmail(user.email || '')
    }
  }, [])

  const handlePayment = () => {
    if (!sdkReady || typeof window.Bootpay === 'undefined') {
      alert('Bootpay SDK가 아직 로딩되지 않았습니다.')
      return
    }

    window.Bootpay.request({
      application_id: process.env.NEXT_PUBLIC_BOOTPAY_APPLICATION_ID!,
      price: 5000,
      order_name: '유료 플랜',
      order_id: 'order_' + Date.now(),
      user: {
        id: userId,
        email: userEmail,
      },
      extra: {
        open_type: 'iframe',
      },
    })
      .then((res: any) => {
        console.log('✅ 결제 요청 성공:', res)
      })
      .catch((err: any) => {
        console.error('❌ 결제 요청 실패:', err)
      })
  }

  return (
    <main className="p-10 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">💳 Bootpay 결제</h1>
      <p className="mb-4 text-gray-600">
        SDK 상태: {sdkReady ? '✅ Bootpay 로딩 완료' : '⏳ 로딩 중...'}
      </p>
      <button
        onClick={handlePayment}
        disabled={!sdkReady}
        className="bg-green-600 text-white px-6 py-3 rounded disabled:opacity-50"
      >
        Bootpay 결제하기 (₩5,000)
      </button>
    </main>
  )
}
