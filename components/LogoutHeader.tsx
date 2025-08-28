'use client';

import { signOut } from 'firebase/auth';
// ✅ 경로 수정: index.ts 없이 명시적으로 firebase.ts 지정
import { auth } from '@/lib/firebase/firebase';
import { useRouter } from 'next/navigation';
import { useSubscribePopup } from '@/contexts/SubscribePopupContext';

export default function LogoutHeader() {
  const router = useRouter();
  const { open } = useSubscribePopup();

  // 🔴 로그아웃 처리 함수
  const handleLogout = async () => {
    await signOut(auth);
    router.push('/');
  };

  // ✅ 로그아웃 및 구독 버튼 UI
  return (
    <header className="w-full flex justify-end items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white dark:bg-gray-900">
      {/* 💳 구독 버튼 */}
      <button
        onClick={() => {
          console.log('🟢 [LogoutHeader] 구독 버튼 클릭됨');
          open();
        }}
        className="text-sm bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 transition-colors"
      >
        구독하기
      </button>

      {/* 🔴 로그아웃 버튼 */}
      <button
        onClick={handleLogout}
        className="text-sm bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition-colors"
      >
        로그아웃
      </button>
    </header>
  );
}
