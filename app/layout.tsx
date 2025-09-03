// app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';

import BootpayScript from '@/components/BootpayScript';
import LayoutEffectWrapper from '@/components/LayoutEffectWrapper';
import ServerKeyGuard from '@/components/session/ServerKeyGuard';
import { UserProvider } from '@/contexts/UserContext';

// ✅ 전역 SubscribePopupProvider는 contexts 쪽만 사용합니다.
import { SubscribePopupProvider } from '@/contexts/SubscribePopupContext';

export const metadata: Metadata = {
  title: 'Data Handler',
  description: 'Data Convert & Validation service',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        {/* 전역 스크립트/가드 */}
        <BootpayScript />
        <ServerKeyGuard />
        <LayoutEffectWrapper />

        {/* ✅ 전역 Provider: 한 번만 감쌈 (contexts 버전) */}
        <SubscribePopupProvider>
          <UserProvider>
            {children}
          </UserProvider>
        </SubscribePopupProvider>
      </body>
    </html>
  );
}
