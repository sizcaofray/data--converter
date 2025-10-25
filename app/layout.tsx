// app/layout.tsx
// 설명: 구독 버튼 클릭 시, Bootpay 가능하면 Bootpay 팝업, 아니면 브라우저 팝업(대체창)을 띄움.
// - 다른 파일/디자인 미변경
// - onLoad/onError 같은 이벤트 핸들러 미사용(서버 컴포넌트 규칙 위반 방지)

import './globals.css'
import { ReactNode } from 'react'
import Script from 'next/script'

export const metadata = {
  title: '로그인 페이지',
  description: '구글 계정 로그인 예제',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen transition-colors">
        {/* 1) Bootpay SDK (있으면 사용, 없어도 무시) */}
        <Script
          src="https://cdn.bootpay.co.kr/js/bootpay-4.3.5.min.js"
          strategy="afterInteractive"
        />

        {/* 2) 전역 클릭 위임: #subscribe-btn 또는 [data-open="subscribe"] */}
        <Script id="subscribe-global-binder" strategy="afterInteractive">
          {`
            (function () {
              var APP_ID = ${JSON.stringify(process.env.NEXT_PUBLIC_BOOTPAY_APP_ID || '')};

              function openFallbackPopup() {
                // 사용자 클릭 이벤트에서 호출되므로 팝업 차단에 걸리지 않음
                var w = window.open('', 'subscribe-fallback', 'width=420,height=640');
                if (!w) { alert('팝업이 차단되었습니다. 브라우저 팝업 차단을 해제해 주세요.'); return; }
                w.document.write(\`
                  <!doctype html>
                  <html lang="ko">
                  <head>
                    <meta charset="utf-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1" />
                    <title>구독 준비 중</title>
                    <style>
                      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin:0; }
                      .wrap { display:flex; flex-direction:column; gap:16px; padding:24px; }
                      .h { font-weight:700; font-size:18px; }
                      .p { line-height:1.6; font-size:14px; opacity:.85; }
                      .btn { padding:10px 14px; border:1px solid #e5e7eb; border-radius:8px; background:#f9fafb; cursor:pointer; }
                    </style>
                  </head>
                  <body>
                    <div class="wrap">
                      <div class="h">구독 결제 준비 중</div>
                      <div class="p">
                        결제 모듈이 아직 준비되지 않아 임시 팝업을 표시합니다.<br/>
                        Bootpay 설정이 완료되면 이 창 대신 결제수단 선택 팝업이 표시됩니다.
                      </div>
                      <button class="btn" onclick="window.close()">닫기</button>
                    </div>
                  </body>
                  </html>
                \`);
                w.document.close();
              }

              async function openBootpayPopup() {
                try {
                  // 결제 진행은 하지 않고 수단 선택 UI만 확인 용도
                  var res = await window.Bootpay.request({
                    application_id: APP_ID,
                    price: 1000,
                    order_name: '구독 결제(팝업 테스트)',
                    order_id: 'ORDER_' + Date.now(),
                    user_info: { username: 'Guest', email: 'guest@example.com' }
                  });
                  console.log('Bootpay 응답:', res);
                } catch (err) {
                  console.error('Bootpay 오류:', err);
                }
              }

              function clickHandler(e) {
                // 위임: #subscribe-btn 또는 data-open="subscribe"
                var el = e.target;
                // 버튼 내부 아이콘/스팬 클릭 등을 고려해 상위로 올라가며 탐색
                for (var i = 0; i < 5 && el; i++) {
                  if (el.id === 'subscribe-btn' || (el.getAttribute && el.getAttribute('data-open') === 'subscribe')) {
                    e.preventDefault();

                    // 1) Bootpay 가능 조건: SDK 로드 + APP_ID 존재 + HTTPS 환경 권장
                    if (typeof window !== 'undefined' &&
                        typeof window.Bootpay !== 'undefined' &&
                        APP_ID) {
                      openBootpayPopup();
                    } else {
                      // 2) 조건 미충족 시: 즉시 대체 팝업 창
                      openFallbackPopup();
                    }
                    break;
                  }
                  el = el.parentElement;
                }
              }

              // 중복 바인딩 방지용 플래그
              if (!window.__SUBSCRIBE_GLOBAL_BOUND__) {
                document.addEventListener('click', clickHandler, { passive: false });
                window.__SUBSCRIBE_GLOBAL_BOUND__ = true;
              }
            })();
          `}
        </Script>

        {children}
      </body>
    </html>
  )
}
