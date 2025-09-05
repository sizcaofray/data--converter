// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import { ReactNode } from 'react'
import Script from 'next/script'

import BootpayScript from '@/components/BootpayScript'
import LayoutEffectWrapper from '@/components/LayoutEffectWrapper'
import ServerKeyGuard from '@/components/session/ServerKeyGuard'
import { UserProvider } from '@/contexts/UserContext'
import { SubscribePopupProvider } from '@/contexts/SubscribePopupContext'

export const metadata: Metadata = {
  title: 'Data Handler',
  description: 'Data Convert & Validation service',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      {/* ✅ OS 테마를 자동으로 감지하여 .dark 클래스를 토글 */}
      <Script id="theme-watcher" strategy="beforeInteractive">
        {`
(function () {
  try {
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    var root = document.documentElement;
    var apply = function () {
      if (mql.matches) root.classList.add('dark');
      else root.classList.remove('dark');
    };
    apply();
    if (mql.addEventListener) mql.addEventListener('change', apply);
    else if (mql.addListener) mql.addListener(apply); // Safari 구버전 대응
  } catch (e) {}
})();
        `}
      </Script>

      {/* 색상은 globals.css가 처리. 여기선 높이/전환만 */}
      <body className="min-h-screen transition-colors">
        {/* 전역 스크립트/가드 */}
        <BootpayScript />
        <ServerKeyGuard />
        <LayoutEffectWrapper />

        {/* 전역 Provider */}
        <SubscribePopupProvider>
          <UserProvider>
            {children}
          </UserProvider>
        </SubscribePopupProvider>
      </body>
    </html>
  )
}
