'use client';
/**
 * components/LogoutHeader.tsx
 * - 기존 헤더 파일을 안전하게 정리: 전역 네비게이션 제거/버튼 기본값 보정/디버그 로그
 * - "Data conver"로만 튀는 문제의 99%는 헤더 최상단 onClick/Link 범위 남용 때문
 */

import React, { useEffect } from 'react';
import Link from 'next/link';
// 필요 시: import { useRouter, usePathname } from 'next/navigation';
// import { useRouter, usePathname } from 'next/navigation';

type Props = {
  // 기존에 사용하시던 props가 있으면 유지하세요.
};

export default function LogoutHeader(props: Props) {
  // const router = useRouter();
  // const pathname = usePathname();

  // ✅ 디버그: 마운트 시 현재 상태 출력
  useEffect(() => {
    // console.log('[LogoutHeader] mounted. pathname=', pathname);
    console.log('[LogoutHeader] mounted');
  }, []);

  // ❌ 금지 1) 헤더 컨테이너에 전역 onClick 두지 마세요.
  // ❌ 금지 2) useEffect로 로그인/role 보고 여기서 router.push(...) 하지 마세요.
  //    - 로그인 후 이동 로직은 로그인 버튼 클릭 핸들러나 auth 콜백(또는 페이지 레벨)에서 처리하세요.

  // ✅ 로고/브랜드만 안전하게 링크
  const Brand = (
    <Link href="/" className="inline-flex items-center gap-2 hover:opacity-80">
      {/* 로고가 있으면 <Image> 등의 컴포넌트 */}
      <span className="font-semibold">Data Converter</span>
    </Link>
  );

  // ✅ 로그인/구독/로그아웃 버튼들: 반드시 type="button"
  const LoginButton = (
    <button
      type="button"
      // onClick={... 로그인 핸들러 ...}
      className="text-sm rounded px-3 py-1 bg-white/10 hover:bg-white/20"
    >
      로그인
    </button>
  );

  const SubscribeButton = (
    <button
      type="button"
      // onClick={() => setSubscribeOpen(true)}  // 팝업/모달 오픈만 수행 (절대 라우팅 금지)
      className="text-sm rounded px-3 py-1 border border-white/20 hover:bg-white/10"
    >
      구독
    </button>
  );

  const LogoutButton = (
    <button
      type="button"
      // onClick={... 로그아웃 핸들러 ...}
      className="text-sm rounded px-3 py-1 bg-white/10 hover:bg-white/20"
    >
      로그아웃
    </button>
  );

  return (
    <header
      className="h-14 border-b border-white/10 flex items-center justify-between px-4 select-none"
      // 🔒 절대 전체 onClick 두지 말 것
      // onClick={() => router.push('/convert')}
    >
      {/* 좌측: 브랜드(로고 클릭 = 홈으로만 이동) */}
      <div className="shrink-0">
        {Brand}
      </div>

      {/* 가운데: (필요 시) 페이지 타이틀/검색 등 */}
      <div className="flex-1 px-4">
        {/* 빈 영역 클릭 시 아무 동작 없도록 onClick 금지 */}
      </div>

      {/* 우측: 로그인/구독/로그아웃 - 절대 Link 사용 금지 */}
      <div className="shrink-0 flex items-center gap-3">
        {/* 사용 중인 상태에 맞춰 조건부 렌더링하세요 */}
        {SubscribeButton}
        {LoginButton /* 로그인 상태가 아니면 노출 */}
        {LogoutButton /* 로그인 상태면 노출 */}
      </div>
    </header>
  );
}
