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

// 공지 설정
const NOTICE_ENABLED = process.env.NEXT_PUBLIC_NOTICE_ENABLED === 'true'
const NOTICE_MESSAGE = process.env.NEXT_PUBLIC_NOTICE_MESSAGE || ''
const NOTICE_LEVEL = process.env.NEXT_PUBLIC_NOTICE_LEVEL || 'info'

// 배너 색상 계산 함수
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
        ❌ 기존 문제:
        - body에 min-h-screen(=100vh 강제) 적용
        - 내부 div에 min-h-[calc(100vh-40px)] 중첩
        → 항상 100vh 이상이 되어 불필요한 스크롤 발생

        ✅ 수정:
        - min-h-screen, min-h-[calc(...)] 제거
        - transition-colors는 유지
        - 내용이 짧으면 스크롤 없음, 내용이 길면 자연 스크롤
      */}
      <body className="transition-colors">
        <UserProvider>
          <SubscribePopupProvider>
            {/* ✅ Bootpay SDK를 전역에서 한 번만 로드 */}
            <BootpayScript />

            {/* 공지 배너: position:fixed/sticky 없이 일반 block으로 유지 */}
            {NOTICE_ENABLED && (
              <div className={`${bannerClass(NOTICE_LEVEL)} text-sm`}>
                <div className="max-w-6xl mx-auto px-4 py-2">
                  {NOTICE_MESSAGE}
                </div>
              </div>
            )}

            {/* 앱 콘텐츠: 높이 강제 제거 */}
            <div>
              <Suspense fallback={null}>{children}</Suspense>
            </div>

            {/* 전역 구독 팝업 */}
            <SubscribePopup />

            {/* 하단 푸터 */}
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
