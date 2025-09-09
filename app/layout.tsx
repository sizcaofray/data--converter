// app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';

import BootpayScript from '@/components/BootpayScript';
import LayoutEffectWrapper from '@/components/LayoutEffectWrapper';
// ※ 다크모드용 스크립트(HTML에 .dark 추가)는 사용하지 않습니다.

import { UserProvider } from '@/contexts/UserContext';
import { SubscribePopupProvider } from '@/contexts/SubscribePopupContext';

export const metadata: Metadata = {
  title: 'Data Handler',
  description: 'Data Convert & Validation service',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      {/* 색상은 전부 globals.css의 media 쿼리가 담당 */}
      <body className="min-h-screen transition-colors">
        <BootpayScript />
        <LayoutEffectWrapper />
        <SubscribePopupProvider>
          <UserProvider>
            {children}
          </UserProvider>
        </SubscribePopupProvider>
      </body>
    </html>
  );
}
