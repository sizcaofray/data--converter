import './globals.css'
import { ReactNode } from 'react'
import { Suspense } from 'react'
import UserProvider from '@/contexts/UserContext'
import { SubscribePopupProvider } from '@/contexts/SubscribePopupContext'
import SubscribePopup from '@/components/SubscribePopup'

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
      <body className="h-screen overflow-hidden flex flex-col transition-colors">
        <SubscribePopupProvider>
        {NOTICE_ENABLED && NOTICE_MESSAGE && (
          <div className={`w-full text-sm px-4 py-2 ${bannerClass(NOTICE_LEVEL)}`} role="status" aria-live="polite">
            <div className="max-w-6xl mx-auto">{NOTICE_MESSAGE}</div>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <Suspense fallback={<div className="p-4 text-sm opacity-70">로딩 중…</div>}>
            <UserProvider>
              {/* ——— 여기에 기존 헤더/페이지 콘텐츠가 그대로 렌더됩니다 ——— */}
              {children}
            </UserProvider>
          </Suspense>
        </div>

        <footer className="border-t border-gray-200 dark:border-gray-800 text-xs">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center gap-3">
            <a href="/legal/terms" className="underline underline-offset-2 hover:opacity-80">이용약관</a>
            <span className="opacity-60">·</span>
            <a href="/legal/privacy" className="underline underline-offset-2 hover:opacity-80">개인정보처리방침</a>
          </div>
        </footer>
      
          <SubscribePopup />
        </SubscribePopupProvider>
      </body>
    </html>
  )
}
