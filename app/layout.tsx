import './globals.css'
import { ReactNode, Suspense } from 'react'
import UserProvider from '@/contexts/UserContext'
import { SubscribePopupProvider } from '@/contexts/SubscribePopupContext'
import SubscribePopup from '@/components/SubscribePopup'
import BootpayScript from '@/components/BootpayScript'

export const metadata = {
  title: 'Data Converter',
  description: '다양한 파일 변환 서비스',
}

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

            {/* 전역에서는 세로 구분선(absolute) 없음 */}
            <div className="flex-1 flex flex-col">
              <Suspense fallback={null}>{children}</Suspense>

              <footer className="mt-auto border-t border-gray-200 dark:border-gray-800 text-xs">
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center gap-3">
                  <a href="/legal/terms" className="underline underline-offset-2 hover:opacity-80">
                    이용약관
                  </a>
                  <span className="opacity-60">·</span>
                  <a href="/legal/privacy" className="underline underline-offset-2 hover:opacity-80">
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
