// app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';

import BootpayScript from '@/components/BootpayScript';
import LayoutEffectWrapper from '@/components/LayoutEffectWrapper';
import ServerKeyGuard from '@/components/session/ServerKeyGuard'; // 사용 중이면 유지 그대로
import { UserProvider } from '@/contexts/UserContext';
import { SubscribePopupProvider } from '@/contexts/SubscribePopupContext';

export const metadata: Metadata = {
  title: 'Data Handler',
  description: 'Data Convert & Validation service',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      {/* 색상은 globals.css의 media 쿼리가 담당 */}
      <body className="min-h-screen transition-colors">
        <BootpayScript />
        <ServerKeyGuard />
        <LayoutEffectWrapper />
        <SubscribePopupProvider>
          <UserProvider>{children}</UserProvider>
        </SubscribePopupProvider>
      </body>
    </html>
  );
}
