'use client'; 
// 👆 중요: Provider를 사용하려면 layout 자체가 클라이언트 컴포넌트여야 함
//  - 이전에 hydration mismatch를 피하려고 div 기반으로 분리해두었지만,
//    Provider는 클라이언트여야 하므로 'use client'가 필요합니다.

import React from 'react';
import { Sidebar } from '@/components/Sidebar';           // 예시: 좌측 사이드바
import { LogoutHeader } from '@/components/LogoutHeader'; // 예시: 상단 로그아웃/구독 버튼
import { SubscribePopupProvider } from '@/components/subscribe/SubscribePopupProvider';
// ↑ 실제 경로에 맞게 import 경로를 조정하세요. (예: '@/app/components/...' 등)

export default function ContentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // ✅ 여기서 Provider로 전체 래핑하여 하위 페이지/컴포넌트 어디서든 useSubscribePopup 사용 가능
    <SubscribePopupProvider>
      <div className="min-h-dvh flex">
        {/* 좌측 메뉴 */}
        <Sidebar />
        {/* 우측 본문 */}
        <div className="flex-1 flex flex-col">
          {/* 상단 헤더: 로그아웃/구독 버튼 등 */}
          <LogoutHeader />
          {/* 실제 페이지 컨텐츠 */}
          <main className="flex-1 p-4">
            {children}
          </main>
        </div>
      </div>
    </SubscribePopupProvider>
  );
}
