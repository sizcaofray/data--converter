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

// 공지 배너 스타일
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

      {/**
       * 핵심 변경:
       * - body를 flex 컨테이너로 만들고 min-h-screen을 여기서만 사용합니다.
       *   className="min-h-screen flex flex-col transition-colors"
       *
       *   의미:
       *   1) body 전체 높이는 최소 브라우저 높이(100vh)를 가집니다.
       *   2) 내부를 세로로 쌓습니다.
       *   3) 중간 영역을 flex-1로 주면 footer가 항상 맨 아래에 붙습니다.
       *
       *   장점:
       *   - 컨텐츠가 적을 때 → footer가 화면 하단에 고정처럼 보입니다.
       *   - 컨텐츠가 길 때 → flex-1 영역이 커지고 페이지 전체가 자연스럽게 스크롤됩니다.
       *
       *   중요한 점:
       *   - 우리는 (contents)/layout.tsx, Sidebar, 각 page에서
       *     min-h-screen / overflow-auto 등을 제거한 상태입니다.
       *   - 따라서 body에 min-h-screen을 주는 것은
       *     '추가로 한 번만' 들어가는 100vh 요구라서
       *     다시 "항상 스크롤바" 문제를 일으키지 않습니다.
       *     (겹쳐서 100vh+α 가 되지 않도록 내부는 vh 강제를 제거해 둔 상태이기 때문입니다.)
       */}
      <body className="min-h-screen flex flex-col transition-colors">
        <UserProvider>
          <SubscribePopupProvider>
            {/* Bootpay SDK 전역 로드 */}
            <BootpayScript />

            {/* 상단 공지 배너 (일반 block, sticky/fixed 아님) */}
            {NOTICE_ENABLED && (
              <div className={`${bannerClass(NOTICE_LEVEL)} text-sm`}>
                <div className="max-w-6xl mx-auto px-4 py-2">
                  {NOTICE_MESSAGE}
                </div>
              </div>
            )}

            {/**
             * flex-1 영역
             * - 이 영역이 남은 세로 공간을 차지합니다.
             * - children 안에는 (contents)/layout.tsx 전체가 들어옵니다.
             * - 여기에는 별도 min-h-screen을 주지 않습니다.
             */}
            <div className="flex-1">
              <Suspense fallback={null}>{children}</Suspense>
            </div>

            {/* 전역 구독 팝업 (모달) */}
            <SubscribePopup />

            {/* footer: 항상 body 맨 하단에 위치 */}
            + <footer className="relative border-t border-gray-200 dark:border-gray-800 text-xs
                before:content-[''] before:absolute before:left-64 before:top-0 before:bottom-0
                before:w-px before:bg-gray-700/50">
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
