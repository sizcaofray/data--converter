// app/layout.tsx
import './globals.css'
import { ReactNode, Suspense } from 'react'
import UserProvider from '@/contexts/UserContext'

// ⬇️ 추가: 구독 팝업 컨텍스트 & 전역 팝업, Bootpay 스크립트
import { SubscribePopupProvider } from '@/contexts/SubscribePopupContext'
import SubscribePopup from '@/components/SubscribePopup'
import BootpayScript from '@/components/BootpayScript'

export const metadata = { title: '로그인 페이지', description: '구글 계정 로그인 예제' }

const NOTICE_ENABLED = process.env.NEXT_PUBLIC_NOTICE_ENABLED === 'true'
const NOTICE_MESSAGE = process.env.NEXT_PUBLIC_NOTICE_MESSAGE || ''
const NOTICE_LEVEL = process.env.NEXT_PUBLIC_NOTICE_LEVEL || 'info'

function bannerClass(level: string) {
  switch (level) {
    case 'warn':  return 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100'
    case 'error': return 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100'
    default:      return 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
  }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <meta name="google-site-verification" content="pOguJ27pS61Q0gqU9afI8X_wXywspJ5UCMOfsa6XsL4" />
      </head>
      <body className="min-h-screen transition-colors">
        {/* ✅ 전역 컨텍스트: 팝업 open()이 실제로 동작하도록 보장 */}
        <UserProvider>
          <SubscribePopupProvider>
            {/* ✅ Bootpay SDK를 전역에서 한 번만 로드 */}
            <BootpayScript />

            {/* 공지 배너(기존 유지) */}
            {NOTICE_ENABLED && (
              <div className={`${bannerClass(NOTICE_LEVEL)} text-sm`}>
                <div className="max-w-6xl mx-auto px-4 py-2">{NOTICE_MESSAGE}</div>
              </div>
            )}

            {/* 앱 콘텐츠 */}
            <div className="min-h-[calc(100vh-40px)]">
              <Suspense fallback={null}>{children}</Suspense>
            </div>

            {/* ✅ 전역 구독 팝업: 어디서든 open() 호출 시 즉시 표시 */}
            <SubscribePopup />

            <footer className="border-t border-gray-200 dark:border-gray-800 text-xs">
              <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center gap-3">
                <a href="/legal/terms" className="underline underline-offset-2 hover:opacity-80">이용약관</a>
                <span className="opacity-60">·</span>
                <a href="/legal/privacy" className="underline underline-offset-2 hover:opacity-80">개인정보처리방침</a>
              </div>
            </footer>
          </SubscribePopupProvider>
        </UserProvider>
      </body>
    </html>
  )
}
