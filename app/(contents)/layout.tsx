// 📄 app/(contents)/layout.tsx
import { ReactNode } from 'react';
import Sidebar from '@/components/Sidebar';
import LogoutHeader from '@/components/LogoutHeader';
import '@/app/globals.css';
import LayoutEffectWrapper from '@/components/LayoutEffectWrapper';
import BootpayScript from '@/components/BootpayScript';
import { UserProvider } from '@/contexts/UserContext';
import { SubscribePopupProvider } from '@/contexts/SubscribePopupContext'; // ✅ 추가
import SubscribePopup from '@/components/SubscribePopup'; // ✅ 추가

export const metadata = {
  title: 'Data Tools',
  description: 'Data Convert & Admin Tools',
};

export default function ContentsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white dark:bg-gray-900 text-black dark:text-white">
      <BootpayScript />
      <LayoutEffectWrapper />
      <UserProvider>
        <SubscribePopupProvider> {/* ✅ 전역 팝업 상태 관리 */}
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <LogoutHeader />
            <main className="flex-1 p-10">{children}</main>
            <SubscribePopup /> {/* ✅ 항상 포함되되, context로 표시 제어 */}
          </div>
        </SubscribePopupProvider>
      </UserProvider>
    </div>
  );
}
