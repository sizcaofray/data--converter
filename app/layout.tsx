// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import { ReactNode } from 'react'

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
      {/* ✅ 전역 기본 텍스트: 라이트=진한 / 다크=흰색 */}
      <body className="min-h-screen transition-colors text-slate-900 dark:text-white">
        <BootpayScript />
        <ServerKeyGuard />
        <LayoutEffectWrapper />
        <SubscribePopupProvider>
          <UserProvider>{children}</UserProvider>
        </SubscribePopupProvider>
      </body>
    </html>
  )
}
