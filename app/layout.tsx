// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import { ReactNode } from 'react'

import BootpayScript from '@/components/BootpayScript'
import LayoutEffectWrapper from '@/components/LayoutEffectWrapper'
import ServerKeyGuard from '@/components/session/ServerKeyGuard'
import { UserProvider } from '@/contexts/UserContext'
import { SubscribePopupProvider } from '@/contexts/SubscribePopupContext'
// ✅ 추가
import SubscribePopup from '@/components/SubscribePopup'

export const metadata: Metadata = {
  title: 'Data Handler',
  description: 'Data Convert & Validation service',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen transition-colors text-slate-900 dark:text-white">
        <BootpayScript />
        <ServerKeyGuard />
        <LayoutEffectWrapper />
        <SubscribePopupProvider>
          <UserProvider>{children}</UserProvider>
          {/* ✅ 팝업 실제 마운트 (show=false면 DOM 없음) */}
          <SubscribePopup />
        </SubscribePopupProvider>
      </body>
    </html>
  )
}
