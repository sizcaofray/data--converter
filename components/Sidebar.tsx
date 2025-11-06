'use client';

/**
 * Sidebar — 메뉴 유료화(paid) + 초기 로딩 레이스 방지(비구독자 임시 비활성)
 * -------------------------------------------------------------------
 * - Firestore: settings/uploadPolicy 문서의 navigation.disabled, navigation.paid 두 배열을 구독
 * - 비구독자/일반유저:
 *     · navigation.paid 에 포함된 메뉴는 "보이되 비활성(클릭 차단)"
 *     · 정책 스냅샷 도착 전(policyLoading)에는 임시로 비활성 → 초기 클릭 리다이렉트 방지
 * - 관리자(admin) 또는 구독자(isSubscribed=true): 항상 활성
 * - 관리자 전용 메뉴(adminOnly)는 일반 유저에겐 숨김
 * - 슬러그 정규화: 'pdf' -> 'pdf-tool', 'pattern' -> 'pattern-editor'
 *
 * ⚠️ 주의: 보안은 페이지/미들웨어 가드가 최종 책임. 본 컴포넌트는 "UX상 클릭 차단" 역할입니다.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';

import { auth, db } from '@/lib/firebase/firebase'; // ✅ 프로젝트 경로 유지
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

/** 사이드바 메뉴 정의: slug는 관리자 설정과 1:1로 매칭되도록 유지 */
type MenuItem = {
  slug: string;          // 내부 기준 슬러그
  label: string;         // 화면 표시명
  href: string;          // 라우트 경로
  adminOnly?: boolean;   // 관리자 전용 메뉴 여부
};

const MENUS: MenuItem[] = [
  { slug: 'convert',         label: 'Data Convert',   href: '/convert' },
  { slug: 'compare',         label: 'Compare',        href: '/compare' },
  { slug: 'pdf-tool',        label: 'PDF Tool',       href: '/pdf-tool' },
  { slug: 'pattern-editor',  label: 'Pattern Editor', href: '/pattern-editor' },
  { slug: 'random',          label: 'Random',         href: '/random' },
  { slug: 'admin',           label: 'Admin',          href: '/admin', adminOnly: true },
];

/** Firestore settings/uploadPolicy 문서 타입 */
type UploadPolicy = {
  navigation?: {
    disabled?: string[];  // 관리자 임의 비활성화 목록
    paid?: string[];      // ✅ 유료화 적용 목록 (구독자/관리자만 활성)
  };
};

/** 공통: 소문자·트림 정규화 */
const norm = (v: string) => String(v || '').trim().toLowerCase();

/** 과거 키 혼재 대응: 'pdf'/'pattern' → 내부 기준 슬러그로 통일 */
function normalizeToInternalSlug(input: string): string {
  const s = norm(input);
  switch (s) {
    case 'pdf':
      return 'pdf-tool';
    case 'pattern':
      return 'pattern-editor';
    default:
      return s;
  }
}

export default function Sidebar() {
  const pathname = usePathname();

  // ───────────────────────────────
  // 1) 로그인/프로필(역할·구독) 구독
  // ───────────────────────────────
  const [signedIn, setSignedIn] = useState(false);
  const [role, setRole] = useState<'admin' | 'user'>('user'); // users/{uid}.role === 'admin' 이면 admin
  const [isSubscribed, setIsSubscribed] = useState(false);    // users/{uid}.isSubscribed

  useEffect(() => {
    let unsubUser: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setSignedIn(!!u);

      if (!u) {
        // 로그아웃 상태 초기화
        setRole('user');
        setIsSubscribed(false);
        if (unsubUser) {
          unsubUser();
          unsubUser = null;
        }
        return;
      }

      // 로그인 상태: users/{uid} 실시간 구독
      const userRef = doc(db, 'users', u.uid);
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }
      unsubUser = onSnapshot(
        userRef,
        (snap) => {
          const data = snap.exists() ? (snap.data() as any) : {};
          const roleNorm = norm(data.role ?? 'user');
          setRole(roleNorm === 'admin' ? 'admin' : 'user');
          setIsSubscribed(Boolean(data.isSubscribed));
        },
        () => {
          // 오류 시 안전 기본값
          setRole('user');
          setIsSubscribed(false);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubUser) unsubUser();
    };
  }, []);

  // ───────────────────────────────
  // 2) 관리자 정책(비활성/유료화) 구독 + 정책 로딩 상태
  // ───────────────────────────────
  const [policyLoading, setPolicyLoading] = useState(true);  // ✅ 스냅샷 도착 전 임시 비활성
  const [disabledSlugs, setDisabledSlugs] = useState<string[]>([]);
  const [paidSlugs, setPaidSlugs] = useState<string[]>([]);

  useEffect(() => {
    setPolicyLoading(true); // 스냅샷 도착 전
    const ref = doc(db, 'settings', 'uploadPolicy');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.exists() ? (snap.data() as UploadPolicy) : {}) || {};
        const rawDisabled = data.navigation?.disabled ?? [];
        const rawPaid = data.navigation?.paid ?? []; // ✅ 유료화 배열

        // 슬러그 정규화 후 상태 반영
        setDisabledSlugs(rawDisabled.map(normalizeToInternalSlug));
        setPaidSlugs(rawPaid.map(normalizeToInternalSlug));

        setPolicyLoading(false); // 첫 스냅샷 수신 완료
      },
      () => {
        // 스냅샷 오류 시 안전 기본값
        setDisabledSlugs([]);
        setPaidSlugs([]);
        setPolicyLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // ───────────────────────────────
  // 3) 메뉴 렌더 상태 계산
  // ───────────────────────────────
  const menuView = useMemo(() => {
    const canSeeAll = role === 'admin' || isSubscribed; // 관리자/구독자는 유료 메뉴도 활성

    return MENUS.map((m) => {
      // (A) 숨김 여부: 비로그인 정책 및 관리자 전용
      const hidden =
        (!signedIn && m.slug !== 'convert') || // 비로그인 시 convert만 보이게 하려는 기존 정책이 있다면 유지
        (m.adminOnly && role !== 'admin');     // 관리자 전용 메뉴는 일반 유저에겐 숨김

      // (B) 관리자 임의 비활성
      const disabledByAdmin = disabledSlugs.includes(m.slug);

      // (C) 유료화 적용: paid 목록에 있고, 관리자/구독자가 아니면 비활성
      const isPaid = paidSlugs.includes(m.slug);
      const disabledByPaid = isPaid && !canSeeAll;

      // (D) 정책 로딩 중 보호: 일반 유저(관리자/구독자 제외)는 임시 비활성 → 초기 클릭 리다이렉트 방지
      const disabledByLoading = policyLoading && !canSeeAll;

      return {
        ...m,
        isPaid,
        hidden,
        isDisabled: disabledByAdmin || disabledByPaid || disabledByLoading,
      };
    });
  }, [signedIn, role, isSubscribed, disabledSlugs, paidSlugs, policyLoading]);

  // ───────────────────────────────
  // 4) 렌더링
  // ───────────────────────────────
  return (
    <aside className="w-64 shrink-0">
      <div className="px-3 py-3 text-xs uppercase tracking-wider opacity-60">Menu</div>

      <nav className="px-2 pb-4">
        <ul className="space-y-1">
          {menuView.filter((m) => !m.hidden).map((m) => {
            const active = pathname.startsWith(m.href);
            const base = 'group block rounded-md px-3 py-2 text-sm transition select-none';
            const enabled =
              active
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-gray-900 dark:text-white hover:bg-blue-100/70 dark:hover:bg-blue-800/40';
            const disabled = 'opacity-40 cursor-not-allowed';

            // 라벨 + 배지
            const label = (
              <span className="inline-flex items-center gap-2">
                {m.label}
                {m.isPaid && (
                  <span className="text-[10px] rounded px-1.5 py-0.5 border border-amber-300/60 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-900/20">
                    유료
                  </span>
                )}
                {/* 정책 로딩 중, 일반 유저에게만 힌트 배지 표시(선택) */}
                {policyLoading && !(role === 'admin' || isSubscribed) && (
                  <span className="text-[10px] ml-1 opacity-60">로딩중</span>
                )}
              </span>
            );

            return (
              <li key={m.slug}>
                {m.isDisabled ? (
                  // ✅ 완전 비활성: a태그 대신 span으로 렌더 → 클릭/탭 차단
                  <span
                    className={clsx(base, disabled)}
                    aria-disabled="true"
                    title={
                      policyLoading && !(role === 'admin' || isSubscribed)
                        ? '정책 로딩 중'
                        : m.isPaid && !(role === 'admin' || isSubscribed)
                        ? '구독이 필요합니다'
                        : '관리자에 의해 비활성화됨'
                    }
                  >
                    {label}
                  </span>
                ) : (
                  // ✅ 활성: 정상 링크
                  <Link href={m.href} className={clsx(base, enabled)}>
                    {label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
