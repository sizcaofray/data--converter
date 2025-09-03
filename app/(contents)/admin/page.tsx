'use client'; 
// ↑ 클라이언트 컴포넌트 지시문은 반드시 파일 최상단에 위치해야 합니다.

// ✅ /admin 페이지를 동적 렌더링으로 강제 → 프리렌더(SSG) 중 훅 호출을 차단
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { useMemo } from 'react';
import { useUser } from '@/contexts/UserContext';

export default function AdminPage() {
  // 사용자 컨텍스트(권한)
  const { role, loading } = useUser();

  // role 문자열 정규화 (공백/대소문자 이슈 제거)
  const isAdmin = useMemo(
    () => ((role ?? '') as string).trim().toLowerCase() === 'admin',
    [role]
  );

  // 초기 로딩 UI
  if (loading) {
    return <p className="p-6 text-gray-500">로딩 중...</p>;
  }

  // 비관리자 차단
  if (!isAdmin) {
    return <p className="p-6 text-red-500">⛔ 관리자 권한이 없습니다.</p>;
  }

  // ↓↓↓ 실제 관리자 UI를 이 영역에 구성하세요 ↓↓↓
  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">관리자 페이지</h1>
      <p className="text-sm text-gray-500">환경설정/권한관리/업로드 제한 등</p>
      {/* TODO: 관리자 기능 컴포넌트 배치 */}
    </main>
  );
}
