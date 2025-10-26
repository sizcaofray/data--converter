// app/layout.tsx
export const dynamic = 'force-dynamic';

import './globals.css';
import type { ReactNode } from 'react';
import SubscribePopup from '@/components/SubscribePopup';

export const metadata = {
  title: '로그인 페이지',
  description: '구글 계정 로그인 예제',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen transition-colors">
        {children}
        {/* 구독 버튼 클릭 시 팝업 표시 */}
        <SubscribePopup />
      </body>
    </html>
  );
}
