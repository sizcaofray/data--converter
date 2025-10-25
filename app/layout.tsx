// app/layout.tsx
// 설명: 현재 레이아웃 구조(UserProvider, SubscribePopupProvider, SubscribePopup)는 그대로 두고,
//       Bootpay SDK 로드 + id="subscribe-btn" 클릭 시 "결제수단 선택 팝업"만 뜨도록 최소 바인딩을 추가합니다.

import './globals.css'
import { ReactNode, Suspense } from 'react'
import Script from 'next/script' // ← Bootpay 스크립트 및 바인더 주입용

// ✅ 기존 전역 컨텍스트/프로바이더 유지 (수정/삭제 없음)
import UserProvider from '@/contexts/UserContext'
import { SubscribePopupProvider } from '@/contexts/SubscribePopupContext'
import SubscribePopup from '@/components/SubscribePopup'

// (선택) 공지 배너 환경변수 – 기존에 쓰고 계셨다면 유지
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

        {/* (선택) 공지 배너 – 기존 사용 시 그대로 표시 */}
        {NOTICE_ENABLED && NOTICE_MESSAGE && (
          <div
            className={`w-full text-sm px-4 py-2 ${bannerClass(NOTICE_LEVEL)}`}
            role="status"
            aria-live="polite"
          >
            <div className="max-w-6xl mx-auto">{NOTICE_MESSAGE}</div>
          </div>
        )}

        {/* ✅ Bootpay SDK 로드: 하이드레이션 이후 로드 (기존 구조에 영향 없음) */}
        <Script
          src="https://cdn.bootpay.co.kr/js/bootpay-4.3.5.min.js"
          strategy="afterInteractive"
          onLoad={() => console.log('[Bootpay] script loaded')}
          onError={(e) => console.error('[Bootpay] script load error:', e)}
        />

        {/* ✅ 구독 버튼(id="subscribe-btn") 클릭 시 "결제수단 선택 팝업"만 띄우는 최소 바인딩 */}
        <Script id="bootpay-subscribe-binder" strategy="afterInteractive">
          {`
            (function () {
              // .env.local에 반드시 설정 필요
              const APP_ID = ${JSON.stringify(process.env.NEXT_PUBLIC_BOOTPAY_APP_ID || '')};

              function handleClick(e) {
                e.preventDefault();

                // Bootpay 스크립트 로드 확인
                if (typeof window === 'undefined' || typeof window.Bootpay === 'undefined') {
                  console.error('❌ Bootpay 미로딩');
                  alert('결제 모듈 로딩 중입니다. 잠시 후 다시 시도해 주세요.');
                  return;
                }

                // App ID 확인
                if (!APP_ID) {
                  console.error('❌ NEXT_PUBLIC_BOOTPAY_APP_ID 미설정');
                  alert('결제 설정(APP_ID)이 누락되었습니다. 관리자에게 문의해 주세요.');
                  return;
                }

                // 👉 결제 진행 없이 "수단 선택 팝업 UI"만 표시 (더미 값)
                window.Bootpay.request({
                  application_id: APP_ID,
                  price: 1000, // 팝업 표시에 필요한 최소 값(결제 수행 아님)
                  order_name: '구독 결제(팝업 테스트)',
                  order_id: 'ORDER_' + Date.now(),
                  user_info: { username: 'Guest', email: 'guest@example.com' },
                })
                .then(function(res){ console.log('✅ Bootpay 응답:', res); })
                .catch(function(err){ console.error('❌ Bootpay 오류:', err); });
              }

              function bind() {
                // 구독 버튼은 어디에 있든 id="subscribe-btn"만 달려있으면 동작
                var btn = document.getElementById('subscribe-btn');
                if (!btn) return; // 버튼이 없으면 조용히 종료(다른 페이지 영향 없음)

                // 중복 바인딩 방지
                btn.removeEventListener('click', handleClick, { passive: false });
                btn.addEventListener('click', handleClick, { passive: false });
              }

              // DOM 준비 후 바인딩
              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', bind);
              } else {
                bind();
              }

              // 라우트 전환 시 버튼이 교체되는 경우를 대비한 관찰(옵션)
              // 필요 없다면 아래 구간 삭제 가능
              var obs = new MutationObserver(function() { bind(); });
              obs.observe(document.body, { childList: true, subtree: true });
            })();
          `}
        </Script>

        {/* ✅ 기존 전역 컨텍스트/팝업 구조 유지 */}
        <Suspense fallback={<div className="p-4 text-sm opacity-70">로딩 중…</div>}>
          <UserProvider>
            <SubscribePopupProvider>
              {children}
              <SubscribePopup />
            </SubscribePopupProvider>
          </UserProvider>
        </Suspense>

        {/* (선택) 기존 푸터 유지 */}
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
