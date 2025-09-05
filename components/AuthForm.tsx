'use client'

import {
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'

// ✅ Firebase 인증 및 DB 객체는 firebase.ts에서 직접 import
import { auth, db } from '@/lib/firebase/firebase'

import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function AuthForm() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  /**
   * 🔧 사용자 문서 보장/보정:
   * - 최초 로그인 시 문서가 없으면 기본 필드(role, isSubscribed) 포함해 생성
   * - 문서가 있어도 누락된 필드가 있으면 merge 로 보정
   */
  const ensureUserDocument = async (uid: string, email: string) => {
    const userRef = doc(db, 'users', uid)
    const snap = await getDoc(userRef)

    if (!snap.exists()) {
      await setDoc(
        userRef,
        {
          uid,
          email,
          role: 'user',          // ✅ 기본 롤
          isSubscribed: false,   // ✅ 기본 구독 상태
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        { merge: true }
      )
      return
    }

    const data = snap.data() as any
    const patch: Record<string, any> = {}
    let needsUpdate = false

    if (typeof data.role === 'undefined') {
      patch.role = 'user'
      needsUpdate = true
    }
    if (typeof data.isSubscribed === 'undefined') {
      patch.isSubscribed = false
      needsUpdate = true
    }
    if (needsUpdate) {
      patch.updatedAt = Date.now()
      await setDoc(userRef, patch, { merge: true })
    }
  }

  // ✅ 로그인 유지: 로컬(브라우저 재시작 후에도 유지되길 원하면 browserLocalPersistence)
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence)

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserEmail(user.email ?? null)
        // 🔑 사용자 문서 보장/보정
        await ensureUserDocument(user.uid, user.email ?? '')
      } else {
        setUserEmail(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider()
    const cred = await signInWithPopup(auth, provider)
    const u = cred.user
    setUserEmail(u.email ?? null)
    // 🔑 로그인 직후에도 보장/보정
    await ensureUserDocument(u.uid, u.email ?? '')
    // 필요 시 라우팅
    // router.push('/convert')
  }

  const handleLogout = async () => {
    await signOut(auth)
    setUserEmail(null)
    // router.push('/')
  }

  return (
    <div className="w-full max-w-sm mx-auto border rounded-lg p-4 space-y-3">
      {/* 단순한 상태 출력 */}
      {loading ? (
        <div className="text-sm text-gray-500">인증 상태 확인 중…</div>
      ) : (
        <>
          <div className="text-sm">
            {userEmail ? `로그인됨: ${userEmail}` : '로그인 필요'}
          </div>

          {userEmail ? (
            <button
              onClick={handleLogout}
              className="w-full border px-4 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              로그아웃
            </button>
          ) : (
            <button
              onClick={handleLogin}
              className="w-full border px-4 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              Google 계정으로 로그인
            </button>
          )}
        </>
      )}
    </div>
  )
}
