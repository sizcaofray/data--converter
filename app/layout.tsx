// 📄 app/layout.tsx
// - 루트 레이아웃(서버 컴포넌트). 전역 CSS, 스크립트, 가드, 전역 Provider를 배치합니다.
// - 여기서 단 한 번 SubscribePopupProvider로 전체 앱을 감싸, 어떤 페이지/헤더에서도
//   useSubscribePopup 훅이 안전하게 동작하도록 보장합니다.

import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';

// 전역 스크립트/가드/컨텍스트 (기존 유지)
import BootpayScript from '@/components/BootpayScript';
import LayoutEffectWrapper from '@/components/LayoutEffectWrapper';
import ServerKeyGuard from '@/components/session/ServerKeyGuard';
import { UserProvider } from '@/contexts/UserContext';

// ✅ 구독 팝업 전역 Provider (경로/대소문자 주의: 'subscribe'는 소문자 폴더명)
import SubscribePopupProvider from '@/components/subscribe/SubscribePopupProvider';

export const metadata: Metadata = {
  title: 'Data Handler',
  description: 'Data Convert & Validation service',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        {/* ✅ 전역 Provider: 여기서 단 한 번 전체 트리를 감쌉니다. */}
        <SubscribePopupProvider>
          {/* Bootpay SDK 로드 */}
          <BootpayScript />

          {/* 서버 세션 키(digest) 확인: 200 OK + 변경 시 안전 로그아웃 */}
          <ServerKeyGuard />

          {/* 레이아웃 전역 이펙트(기존 유지) */}
          <LayoutEffectWrapper />

          {/* 전역 사용자 컨텍스트 */}
          <UserProvider>
            {children}
          </UserProvider>
        </SubscribePopupProvider>
      </body>
    </html>
  );
}
