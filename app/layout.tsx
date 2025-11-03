// app/layout.tsx
import './globals.css'
import { ReactNode, Suspense } from 'react'
import UserProvider from '@/contexts/UserContext'
import { SubscribePopupProvider } from '@/contexts/SubscribePopupContext'
import SubscribePopup from '@/components/SubscribePopup'
import BootpayScript from '@/components/BootpayScript'

export const metadata = {
  title: '로그인 페이지',
  description: '구글 계정 로그인 예제',
}

// 공지 관련 환경변수
const NOTICE_ENABLED = process.env.NEXT_PUBLIC_NOTICE_ENABLED === 'true'
const NOTICE_MESSAGE = process.env.NEXT_PUBLIC_NOTICE_MESSAGE || ''
const NOTICE_LEVEL = process.env.NEXT_PUBLIC_NOTICE_LEVEL || 'info'

// 공지 배너 스타일 선택 함수
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <meta
          name="google-site-verification"
          content="pOguJ27pS61Q0gqU9afI8X_wXywspJ5UCMOfsa6XsL4"
        />
      </head>

      {/*
        핵심 수정:
        - body에서 min-h-screen 제거
        - 이후 래퍼 div에서 min-h-[calc(100vh-40px)] 제거
        => 강제적으로 "항상 100vh 이상"이라는 요구를 없앱니다.
        => 내용이 짧으면 스크롤바가 사라질 수 있게 됩니다.
      */}
      <body className="transition-colors">
        <UserProvider>
          <SubscribePopupProvider>
            {/* Bootpay SDK 전역 로드 */}
            <BootpayScript />

            {/* 공지 배너 (고정/sticky 아님) */}
            {NOTICE_ENABLED && (
              <div className={`${bannerClass(NOTICE_LEVEL)} text-sm`}>
                <div className="max-w-6xl mx-auto px-4 py-2">
                  {NOTICE_MESSAGE}
                </div>
              </div>
            )}

            {/* 실제 앱 콘텐츠 - 높이 강제 없음 */}
            <div>
              <Suspense fallback={null}>{children}</Suspense>
            </div>

            {/* 전역 구독 팝업 */}
            <SubscribePopup />

            {/* 푸터 */}
            <footer className="border-t border-gray-200 dark:border-gray-800 text-xs">
              <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center gap-3">
                <a
                  href="/legal/terms"
                  className="underline underline-offset-2 hover:opacity-80"
                >
                  이용약관
                </a>
                <span className="opacity-60">·</span>
                <a
                  href="/legal/privacy"
                  className="underline underline-offset-2 hover:opacity-80"
                >
                  개인정보처리방침
                </a>
              </div>
            </footer>
          </SubscribePopupProvider>
        </UserProvider>
      </body>
    </html>
  )
}
