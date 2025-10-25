// app/layout.tsx
// 설명: Bootpay SDK 로드 + id="subscribe-btn" 클릭 시 결제수단 팝업 호출.
// 변경점: onLoad/onError 제거(서버 컴포넌트에 이벤트 핸들러 금지 에러 해결)

import './globals.css'
import { ReactNode, Suspense } from 'react'
import Script from 'next/script'

// (쓰신다면 유지하세요) 전역 컨텍스트/팝업
import UserProvider from '@/contexts/UserContext'
import { SubscribePopupProvider } from '@/contexts/SubscribePopupContext'
import SubscribePopup from '@/components/SubscribePopup'

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
        {NOTICE_ENABLED && NOTICE_MESSAGE && (
          <div
            className={`w-full text-sm px-4 py-2 ${bannerClass(NOTICE_LEVEL)}`}
            role="status"
            aria-live="polite"
          >
            <div className="max-w-6xl mx-auto">{NOTICE_MESSAGE}</div>
          </div>
        )}

        {/* ✅ 1) Bootpay SDK 로드 (이벤트 핸들러 제거) */}
        <Script
          src="https://cdn.bootpay.co.kr/js/bootpay-4.3.5.min.js"
          strategy="afterInteractive"
        />

        {/* ✅ 2) 구독 버튼 클릭 → 결제수단 팝업 */}
        <Script id="bootpay-subscribe-binder" strategy="afterInteractive">
          {`
            (function () {
              const APP_ID = ${JSON.stringify(process.env.NEXT_PUBLIC_BOOTPAY_APP_ID || '')};

              function handleClick(e) {
                e.preventDefault();
                if (typeof window === 'undefined' || typeof window.Bootpay === 'undefined') {
                  console.error('❌ Bootpay 미로딩');
                  alert('결제 모듈 로딩 중입니다. 잠시 후 다시 시도해 주세요.');
                  return;
                }
                if (!APP_ID) {
                  console.error('❌ NEXT_PUBLIC_BOOTPAY_APP_ID 미설정');
                  alert('결제 설정(APP_ID)이 누락되었습니다. 관리자에게 문의해 주세요.');
                  return;
                }

                window.Bootpay.request({
                  application_id: APP_ID,
                  price: 1000,
                  order_name: '구독 결제(팝업 테스트)',
                  order_id: 'ORDER_' + Date.now(),
                  user_info: { username: 'Guest', email: 'guest@example.com' },
                })
                .then(function(res){ console.log('✅ Bootpay 응답:', res); })
                .catch(function(err){ console.error('❌ Bootpay 오류:', err); });
              }

              function bind() {
                var btn = document.getElementById('subscribe-btn');
                if (!btn) return;
                // 중복 방지: 기존 핸들러 제거 후 재바인딩
                btn.removeEventListener('click', handleClick, { passive: false });
                btn.addEventListener('click', handleClick, { passive: false });
              }

              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', bind);
              } else {
                bind();
              }

              // 라우트 전환 시 버튼이 새로 렌더되면 다시 바인딩
              var obs = new MutationObserver(function() { bind(); });
              obs.observe(document.body, { childList: true, subtree: true });
            })();
          `}
        </Script>

        <Suspense fallback={<div className="p-4 text-sm opacity-70">로딩 중…</div>}>
          <UserProvider>
            <SubscribePopupProvider>
              {children}
              <SubscribePopup />
            </SubscribePopupProvider>
          </UserProvider>
        </Suspense>

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
