'use client';

import { useMemo } from 'react';
import { useUser } from '@/contexts/UserContext';

export default function AdminPage() {
  const { role, loading } = useUser();

  // role 문자열만 정규화해서 판단 (공백/대소문자 이슈 제거)
  const isAdmin = useMemo(
    () => ((role ?? '') as string).trim().toLowerCase() === 'admin',
    [role]
  );

  // 초기 로딩 UI (원하시면 유지)
  if (loading) return <p className="p-6 text-gray-500">로딩 중...</p>;

  // 비관리자 차단
  if (!isAdmin) return <p className="p-6 text-red-500">⛔ 관리자 권한이 없습니다.</p>;

  // ↓↓↓ 원래의 관리자 UI 그대로 유지 ↓↓↓
  return (
    <main className="p-6">
      {/* 기존 관리자 페이지 내용 */}
    </main>
  );
}
