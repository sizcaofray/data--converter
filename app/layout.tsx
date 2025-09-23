// layout.tsx
// 목적: 사이트 전역 레이아웃. 상단 공지 배너(ENV로 ON/OFF), 하단 푸터(약관/개인정보 링크) 추가.
// 주의: 디자인 변경 최소화. 기존 children 렌더 구조 유지.
// 다크모드 자동 추종: globals.css에서 이미 적용됨.

import './globals.css'
import { ReactNode } from 'react'

// ▶ 공지 배너는 환경변수로 제어 (Vercel 또는 .env.local)
// - NEXT_PUBLIC_NOTICE_ENABLED: 'true'면 배너 노출
// - NEXT_PUBLIC_NOTICE_MESSAGE: 배너 메시지 문자열
// - NEXT_PUBLIC_NOTICE_LEVEL: 'info' | 'warn' | 'error' (배경색만 다르게 표시)
const NOTICE_ENABLED = process.env.NEXT_PUBLIC_NOTICE_ENABLED === 'true'
const NOTICE_MESSAGE = process.env.NEXT_PUBLIC_NOTICE_MESSAGE || ''
const NOTICE_LEVEL = process.env.NEXT_PUBLIC_NOTICE_LEVEL || 'info'

export const metadata = {
  title: '로그인 페이지',
  description: '구글 계정 로그인 예제',
}

// ▶ 배너 색상 간단 매핑 (디자인 최소 변경)
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
      {/* body는 기존 스타일 유지, 다크모드 자동 추종 */}
      <body className="min-h-screen transition-colors flex flex-col">
        {/* ───────────────────────────────────────────────────────────
            상단 공지 배너 (ENV로 제어)
            - 운영 공지, 점검 알림, 결제 이슈 안내 등에 사용
            - 페이지 이동과 무관하게 전역 표시
           ─────────────────────────────────────────────────────────── */}
        {NOTICE_ENABLED && NOTICE_MESSAGE && (
          <div
            className={`w-full text-sm px-4 py-2 ${bannerClass(
              NOTICE_LEVEL
            )}`}
            role="status"
            aria-live="polite"
          >
            <div className="max-w-6xl mx-auto">
              {NOTICE_MESSAGE}
            </div>
          </div>
        )}

        {/* 메인 콘텐츠 */}
        <div className="flex-1">{children}</div>

        {/* ───────────────────────────────────────────────────────────
            하단 푸터 (법적 고지 링크)
            - 디자인 최소 변경: 얇은 바 + 작은 글씨
            - 약관/개인정보처리방침 링크만 고정 제공
           ─────────────────────────────────────────────────────────── */}
        <footer className="border-t border-gray-200 dark:border-gray-800 text-xs">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center gap-3">
            {/* 내부 링크: /legal/terms, /legal/privacy */}
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
      </body>
    </html>
  )
}
