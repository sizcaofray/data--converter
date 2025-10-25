// app/layout.tsx
import './globals.css'
import { ReactNode, Suspense } from 'react'

// ✅ 기존 전역 컨텍스트/프로바이더가 있다면 유지
// 프로젝트에 이미 존재하는 UserProvider 등을 그대로 사용합니다.
import UserProvider from '@/contexts/UserContext'

// ✅ 전역 팝업: 레이아웃에서는 정의하지 않고, "import 후 배치"만 합니다.
import { SubscribePopupProvider } from '@/contexts/SubscribePopupContext'
import SubscribePopup from '@/components/SubscribePopup'

// (선택) 공지 배너 환경변수 – 기존에 쓰고 계셨다면 유지
const NOTICE_ENABLED = process.env.NEXT_PUBLIC_NOTICE_ENABLED === 'true'
const NOTICE_MESSAGE = process.env.NEXT_PUBLIC_NOTICE_MESSAGE || ''
const NOTICE_LEVEL = process.env.NEXT_PUBLIC_NOTICE_LEVEL || 'info'

function bannerClass(level: string) {
  switch (level) {
    case 'warn':
      return 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100'
    case 'error':
      return 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100'
    default:
      return 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
  }
}

export const metadata = {
  title: '로그인 페이지',
  description: '구글 계정 로그인 예제',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen transition-colors">
        {/* (선택) 공지 배너 – 기존 사용 시 그대로 표시 */}
        {NOTICE_ENABLED && NOTICE_MESSAGE && (
          <div
            className={`w-full text-sm px-4 py-2 ${bannerClass(NOTICE_LEVEL)}`}
            role="status"
            aria-live="polite"
          >
            <div className="max-w-6xl mx-auto">{NOTICE_MESSAGE}</div>
          </div>
        )}

        {/* ✅ 기존 전역 컨텍스트/프로바이더 유지 */}
        <Suspense fallback={<div className="p-4 text-sm opacity-70">로딩 중…</div>}>
          <UserProvider>
            {/* ✅ 전역 팝업 Provider로 감싸서 어디서든 open() 가능 */}
            <SubscribePopupProvider>
              {/* ✅ 기존 페이지/헤더/사이드바 등 컨텐츠 구조 그대로 */}
              {children}

              {/* ✅ 전역 팝업: 레이아웃 안에서 "정의 없이" 마운트만 */}
              <SubscribePopup />
            </SubscribePopupProvider>
          </UserProvider>
        </Suspense>

        {/* (선택) 기존 푸터가 있었다면 유지 */}
        <footer className="border-t border-gray-200 dark:border-gray-800 text-xs">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center gap-3">
            <a href="/legal/terms" className="underline underline-offset-2 hover:opacity-80">이용약관</a>
            <span className="opacity-60">·</span>
            <a href="/legal/privacy" className="underline underline-offset-2 hover:opacity-80">개인정보처리방침</a>
          </div>
        </footer>
      </body>
    </html>
  )
}
