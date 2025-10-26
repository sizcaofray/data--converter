// app/layout.tsx
// 목적: 전역 레이아웃에 SubscribePopup만 주입하여
//       어디서든 구독 버튼을 클릭하면(셀렉터 기준) 팝업이 뜨도록 함.
//       Bootpay 연동 코드는 포함하지 않음(후속 단계에서 연결 예정).

import './globals.css';
import type { ReactNode } from 'react';
import SubscribePopup from '@/components/SubscribePopup'; // ✅ 팝업 컴포넌트 전역 주입

export const metadata = {
  title: '로그인 페이지',
  description: '구글 계정 로그인 예제',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen transition-colors">
        {/* 페이지 본문 */}
        {children}

        {/* ✅ 전역 팝업: 구독 버튼 클릭 시 표시됨 */}
        <SubscribePopup />
      </body>
    </html>
  );
}
