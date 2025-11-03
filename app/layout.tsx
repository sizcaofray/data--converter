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

const NOTICE_ENABLED = process.env.NEXT_PUBLIC_NOTICE_ENABLED === 'true'
const NOTICE_MESSAGE = process.env.NEXT_PUBLIC_NOTICE_MESSAGE || ''
const NOTICE_LEVEL = process.env.NEXT_PUBLIC_NOTICE_LEVEL || 'info'

// 공지 배너 색상
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

      <body className="min-h-screen flex flex-col transition-colors">
        <UserProvider>
          <SubscribePopupProvider>
            <BootpayScript />

            {NOTICE_ENABLED && (
              <div className={`${bannerClass(NOTICE_LEVEL)} text-sm`}>
                <div className="max-w-6xl mx-auto px-4 py-2">{NOTICE_MESSAGE}</div>
              </div>
            )}

            {/* 메인 콘텐츠 + 푸터 */}
            <div className="relative flex-1 flex flex-col">
              {/* ✅ 사이드바 구분선: 푸터 위까지만 표시 (bottom-[3rem]) */}
              <div
                aria-hidden
                className="pointer-events-none absolute left-64 top-0 bottom-[3rem] w-px bg-gray-700/50 hidden sm:block"
              />

              <Suspense fallback={null}>{children}</Suspense>

              {/* 푸터 */}
              <footer className="mt-auto border-t border-gray-200 dark:border-gray-800 text-xs">
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
            </div>

            <SubscribePopup />
          </SubscribePopupProvider>
        </UserProvider>
      </body>
    </html>
  )
}
