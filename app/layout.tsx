// 📄 app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';

import BootpayScript from '@/components/BootpayScript';
import LayoutEffectWrapper from '@/components/LayoutEffectWrapper';
import ServerKeyGuard from '@/components/session/ServerKeyGuard';
import { UserProvider } from '@/contexts/UserContext';

export const metadata: Metadata = {
  title: 'Data Handler',
  description: 'Data Convert & Validation service',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        {/* Bootpay SDK 로드 */}
        <BootpayScript />

        {/* ✅ 서버 세션 키(digest) 확인: 200 OK + 변경 시에만 안전하게 로그아웃 */}
        <ServerKeyGuard />

        {/* 기존 레이아웃 효과(필요 기능 유지) */}
        <LayoutEffectWrapper />

        {/* 전역 사용자 컨텍스트 */}
        <UserProvider>
          {children}
        </UserProvider>
      </body>
    </html>
  );
}
