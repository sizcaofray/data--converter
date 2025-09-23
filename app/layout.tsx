// app/layout.tsx
// 목적: 문서(body)를 100vh로 고정하고 상단(공지)·중앙(콘텐츠)·하단(푸터)을
// flex-col로 배치하여 문서 자체 스크롤을 제거, 중앙만 필요 시 내부 스크롤.
// 디자인은 그대로, 동작/레이아웃만 교정.

import './globals.css'
import { ReactNode } from 'react'

export const metadata = {
  title: '로그인 페이지',
  description: '구글 계정 로그인 예제',
}

// ── (선택) 공지 배너용 ENV (없으면 배너 안보임)
const NOTICE_ENABLED = process.env.NEXT_PUBLIC_NOTICE_ENABLED === 'true'
const NOTICE_MESSAGE = process.env.NEXT_PUBLIC_NOTICE_MESSAGE || ''
const NOTICE_LEVEL = process.env.NEXT_PUBLIC_NOTICE_LEVEL || 'info'

// 배너 색상 간단 매핑
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
      {/* 
        핵심 포인트
        - body: h-screen(=100vh) + overflow-hidden + flex-col
        - 중앙 컨테이너: flex-1 min-h-0 overflow-auto (내부 스크롤 전담)
      */}
      <body className="h-screen overflow-hidden flex flex-col transition-colors">
        {/* 상단 공지 배너 (ENV로 ON/OFF) */}
        {NOTICE_ENABLED && NOTICE_MESSAGE && (
          <div
            className={`w-full text-sm px-4 py-2 ${bannerClass(NOTICE_LEVEL)}`}
            role="status"
            aria-live="polite"
          >
            <div className="max-w-6xl mx-auto">{NOTICE_MESSAGE}</div>
          </div>
        )}

        {/* 중앙: 실제 페이지 콘텐츠.
            - flex-1: 남는 높이를 모두 차지
            - min-h-0: flex 자식에서 overflow 계산 정확히 하게 함 (중요)
            - overflow-auto: 내용이 많을 때만 이 영역 안에서 스크롤 */}
        <div className="flex-1 min-h-0 overflow-auto">
          {children}
        </div>

        {/* 하단 푸터: 법무 링크(디자인 최소) */}
        <footer className="border-t border-gray-200 dark:border-gray-800 text-xs">
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
      </body>
    </html>
  )
}
