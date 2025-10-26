// app/layout.tsx
// 전체 앱을 동적 렌더링으로 강제(프리렌더 에러 방지)
export const dynamic = 'force-dynamic';

import './globals.css';
import type { ReactNode } from 'react';
import SubscribePopup from '@/components/SubscribePopup'; // 구독 버튼 클릭 시 팝업만 표시(결제 미연동 단계)

export const metadata = {
  title: '로그인 페이지',
  description: '구글 계정 로그인 예제',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen transition-colors">
        {children}
        {/* 팝업 컴포넌트 전역 주입: 구독 버튼 있는 페이지에서만 동작 */}
        <SubscribePopup />
      </body>
    </html>
  );
}
