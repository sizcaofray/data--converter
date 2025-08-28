// 📄 app/convert/layout.tsx
'use client'

import Link from 'next/link'
import { ReactNode } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useRouter } from 'next/navigation'

// 🔹 사용자 권한 확인을 위한 커스텀 훅 import
import { useUser } from '@/contexts/UserContext' // ✅ 추가

export default function ConvertLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { role, loading } = useUser() // ✅ 사용자 role 가져오기

  // 🔁 Firebase 로그아웃 함수 정의
  const handleLogout = async () => {
    await signOut(auth)
    console.log('🔓 로그아웃 완료')
    router.push('/')
  }

  // Role 확인
  console.log('🪪 현재 사용자 role:', role, '로딩:', loading);

  return (
    <div className="flex min-h-screen">
      {/* 🔹 좌측 고정 메뉴 */}
      <aside className="w-64 bg-gray-100 dark:bg-gray-800 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">🛠️ Data Tools</h2>
        <ul className="space-y-2">
          {/* ✅ 관리자 전용 메뉴 항목 (최상단에 표시) */}
          {!loading && role === 'admin' && ( 
            <li>
              <Link
                href="/admin"
                className="block px-3 py-2 rounded bg-yellow-100 dark:bg-yellow-700 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-600 font-semibold"
              >
                Administrator
              </Link>
            </li>
          )} 

          {/* 🔸 메뉴: Data Convert */}
          <li>
            <Link
              href="/convert/convert"
              className="block px-3 py-2 rounded hover:bg-blue-200 dark:hover:bg-blue-700"
            >
              Data Convert
            </Link>
          </li>

          {/* 🔸 메뉴: Data Compare */}
          <li>
            <Link
              href="/convert/compare"
              className="block px-3 py-2 rounded hover:bg-blue-200 dark:hover:bg-blue-700"
            >
              Data Compare
            </Link>
          </li>

          {/* 🔸 메뉴: Data Randomizer */}
          <li>
            <Link
              href="/convert/random"
              className="block px-3 py-2 rounded hover:bg-blue-200 dark:hover:bg-blue-700"
            >
              Data Randomizer
            </Link>
          </li>
        </ul>
      </aside>

      {/* 🔹 우측 전체 영역 */}
      <div className="flex-1 flex flex-col">
        {/* ✅ 우측 상단: 로그아웃 버튼 */}
        <header className="w-full flex justify-end px-6 py-3 border-b border-gray-200 bg-white dark:bg-gray-900">
          <button
            onClick={handleLogout}
            className="text-sm bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition-colors"
          >
            로그아웃
          </button>
        </header>

        {/* ✅ 실제 페이지 콘텐츠 영역 */}
        <main className="flex-1 p-10 bg-white dark:bg-gray-900 text-black dark:text-white">
          {children}
        </main>
      </div>
    </div>
  )
}
