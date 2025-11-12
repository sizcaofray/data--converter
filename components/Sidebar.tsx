'use client';

/**
 * Sidebar — 티어 포함 규칙(premium ⊃ basic ⊃ free) + 배지 문구(Basic/Premium)
 * -------------------------------------------------------------------
 * - Firestore: settings/uploadPolicy.navigation.disabled / navigation.paid / navigation.tiers 사용
 *   · disabled: 관리자 임의 비활성(보이되 클릭 차단)
 *   · paid: 하위 호환(있으면 basic으로 간주) — tiers가 없을 때만 사용
 *   · tiers: { [slug]: 'free'|'basic'|'premium' } 우선 적용
 *
 * - 사용자 티어 계산(보정 포함):
 *   · users/{uid}.subscriptionTier 가 'premium'|'basic'이면 그대로 사용
 *   · 그 외/없음 + isSubscribed === true → 'basic' 으로 보정
 *   · 그 외 → 'free'
 *   · 관리자(role==='admin')는 항상 premium 으로 취급(전 메뉴 활성)
 *
 * - 포함 규칙(핵심):
 *   · free 유저 → free 메뉴만 활성
 *   · basic 유저 → free + basic 활성, premium 비활성
 *   · premium 유저 → 전부 활성
 *
 * - 배지: requiredTier가 'basic'이면 'Basic', 'premium'이면 'Premium'으로 표시
 * - 초기 로딩(policyLoading) 동안 일반 유저는 임시 비활성 처리(초기 깜빡임/오동작 방지)
 * - 최종 권한 검증은 서버/미들웨어에서 별도 보안 가드로 처리 권장 (여긴 UX 차단)
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';

// ⚠️ 프로젝트의 기존 Firebase 클라이언트 경로를 그대로 사용하세요.
import { auth, db } from '@/lib/firebase/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

/** 메뉴 정의: slug는 정책 문서와 1:1 매칭되어야 함 */
type MenuItem = {
  slug: string;
  label: string;
  href: string;
  adminOnly?: boolean; // 관리자 전용(일반 사용자에게 숨김)
};

const MENUS: MenuItem[] = [
  { slug: 'convert',         label: 'Data Convert',   href: '/convert' },
  { slug: 'compare',         label: 'Compare',        href: '/compare' },
  { slug: 'pdf-tool',        label: 'PDF Tool',       href: '/pdf-tool' },
  { slug: 'pattern-editor',  label: 'Pattern Editor', href: '/pattern-editor' },
  { slug: 'random',          label: 'Random',         href: '/random' },
  { slug: 'admin',           label: 'Admin',          href: '/admin', adminOnly: true },
];

/** 정책 문서 타입 */
type Tier = 'free' | 'basic' | 'premium';
type UploadPolicy = {
  navigation?: {
    disabled?: string[];                // 관리자 임의 비활성
    paid?: string[];                    // 하위 호환(basic 간주)
    tiers?: Record<string, Tier>;       // 우선 적용
  };
};

/** 문자열 정규화 */
const norm = (v: string) => String(v || '').trim().toLowerCase();

/** 과거 키 혼재 대응: 'pdf'/'pattern' → 내부 기준 슬러그로 통일 */
function normalizeToInternalSlug(input: string): string {
  const s = norm(input);
  switch (s) {
    case 'pdf':     return 'pdf-tool';
    case 'pattern': return 'pattern-editor';
    default:        return s;
  }
}

export default function Sidebar() {
  const pathname = usePathname();

  // ───────────────────────────────
  // 1) 로그인/사용자 역할/구독 상태
  // ───────────────────────────────
  const [signedIn, setSignedIn] = useState(false);
  const [role, setRole] = useState<'admin' | 'user'>('user');   // users/{uid}.role
  const [isSubscribed, setIsSubscribed] = useState(false);      // users/{uid}.isSubscribed (하위 호환)
  const [userTier, setUserTier] = useState<Tier>('free');       // 보정된 사용자 티어

  useEffect(() => {
    let unsubUser: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setSignedIn(!!u);

      // 로그아웃: 초기화
      if (!u) {
        setRole('user');
        setIsSubscribed(false);
        setUserTier('free');
        if (unsubUser) { unsubUser(); unsubUser = null; }
        return;
      }

      // 로그인: users/{uid} 실시간 구독
      const userRef = doc(db, 'users', u.uid);
      if (unsubUser) { unsubUser(); unsubUser = null; }
      unsubUser = onSnapshot(
        userRef,
        (snap) => {
          const data = snap.exists() ? (snap.data() as any) : {};

          // 역할 보정
          const roleNorm = norm(data.role ?? 'user');
          const nextRole: 'admin' | 'user' = roleNorm === 'admin' ? 'admin' : 'user';
          setRole(nextRole);

          // 구독 여부(불리언)
          const nextIsSubscribed = Boolean(data.isSubscribed);
          setIsSubscribed(nextIsSubscribed);

          // 티어 보정 로직(핵심)
          // - subscriptionTier가 'premium'|'basic'이면 그대로 사용
          // - 그 외/없음 + isSubscribed === true → 'basic'으로 보정
          // - 그 외 → 'free'
          const rawTier = norm(data.subscriptionTier ?? '');
          const derived: Tier =
            rawTier === 'premium' ? 'premium' :
            rawTier === 'basic'   ? 'basic'   :
            nextIsSubscribed      ? 'basic'   :
            'free';

          // 관리자는 항상 최상위 권한으로 취급
          setUserTier(nextRole === 'admin' ? 'premium' : derived);
        },
        () => {
          // 에러 시 안전 기본값
          setRole('user');
          setIsSubscribed(false);
          setUserTier('free');
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubUser) unsubUser();
    };
  }, []);

  // ───────────────────────────────
  // 2) 정책 문서(settings/uploadPolicy) 구독
  // ───────────────────────────────
  const [policyLoading, setPolicyLoading] = useState(true);
  const [disabledSlugs, setDisabledSlugs] = useState<string[]>([]);
  const [paidSlugs, setPaidSlugs] = useState<string[]>([]);            // 하위 호환(basic)
  const [tiersMap, setTiersMap] = useState<Record<string, Tier>>({});  // 우선 적용

  useEffect(() => {
    setPolicyLoading(true);
    const ref = doc(db, 'settings', 'uploadPolicy');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.exists() ? (snap.data() as UploadPolicy) : {}) || {};
        const nav = data.navigation ?? {};

        // disabled
        const rawDisabled = Array.isArray(nav.disabled) ? nav.disabled : [];
        setDisabledSlugs(rawDisabled.map((s) => normalizeToInternalSlug(String(s))));

        // paid (tiers 없을 때만 basic으로 간주)
        const rawPaid = Array.isArray(nav.paid) ? nav.paid : [];
        setPaidSlugs(rawPaid.map((s) => normalizeToInternalSlug(String(s))));

        // tiers 맵(우선)
        const rawTiers = nav.tiers ?? {};
        const nextTiers: Record<string, Tier> = {};
        Object.keys(rawTiers).forEach((k) => {
          const key = normalizeToInternalSlug(k);
          const v = norm(String(rawTiers[k] ?? 'free'));
          nextTiers[key] = (v === 'premium' || v === 'basic') ? (v as Tier) : 'free';
        });
        setTiersMap(nextTiers);

        setPolicyLoading(false);
      },
      () => {
        // 스냅샷 실패 시도 안전 기본값
        setDisabledSlugs([]);
        setPaidSlugs([]);
        setTiersMap({});
        setPolicyLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // ───────────────────────────────
  // 3) 메뉴 렌더 상태 계산(포함 규칙 + 배지 문구)
  // ───────────────────────────────
  const menuView = useMemo(() => {
    const isAdmin = role === 'admin';

    // 관리자는 항상 전 메뉴 활성
    const effectiveUserTier: Tier = isAdmin ? 'premium' : userTier;

    return MENUS.map((m) => {
      // (A) 관리자 전용 숨김
      const hidden = !!m.adminOnly && !isAdmin;

      // (B) 관리자 임의 비활성(정책)
      const disabledByAdmin = disabledSlugs.includes(m.slug);

      // (C) 요구 티어 계산
      //     - tiersMap 우선
      //     - 없으면 paidSlugs에 포함 시 'basic'으로 처리(하위 호환)
      //     - 둘 다 없으면 'free'
      const required: Tier =
        tiersMap[m.slug] ?? (paidSlugs.includes(m.slug) ? 'basic' : 'free');

      // (D) 유료 배지 여부 + 문구 (요청사항 반영)
      const isPaid = required !== 'free';
      const paidLabel = required === 'premium' ? 'Premium' : (required === 'basic' ? 'Basic' : '');

      // (E) 포함 규칙(핵심):
      //     premium ⊃ basic ⊃ free
      //     - premium 메뉴: premium 유저(+관리자)만 활성
      //     - basic   메뉴: basic/premium 유저(+관리자) 활성
      //     - free    메뉴: 모두 활성
      const disabledByTier =
        (required === 'premium' && effectiveUserTier !== 'premium' && !isAdmin) ||
        (required === 'basic'   && !['basic', 'premium'].includes(effectiveUserTier) && !isAdmin);
      // free 는 항상 활성(위 조건에 걸리지 않음)

      // (F) 정책 로딩 중 보호(일반 유저만): 초기 깜빡임/오동작 방지
      const disabledByLoading = policyLoading && !isAdmin;

      return {
        ...m,
        required,         // 배지 문구 계산을 위해 보관(필요 시 디버그)
        isPaid,
        paidLabel,
        hidden,
        isDisabled: disabledByAdmin || disabledByTier || disabledByLoading,
      };
    });
  }, [role, userTier, disabledSlugs, paidSlugs, tiersMap, policyLoading]);

  // ───────────────────────────────
  // 4) 렌더(기존 스타일 유지)
  // ───────────────────────────────
  const path = pathname || '/';
  const base = 'group block rounded-md px-3 py-2 text-sm transition select-none';
  const enabled = (active: boolean) =>
    active
      ? 'bg-blue-600 text-white font-semibold'
      : 'text-gray-900 dark:text-white hover:bg-blue-100/70 dark:hover:bg-blue-800/40';
  const disabled = 'opacity-40 cursor-not-allowed';

  return (
    <aside className="w-64 shrink-0">
      <div className="px-3 py-3 text-xs uppercase tracking-wider opacity-60">Menu</div>

      <nav className="px-2 pb-4">
        <ul className="space-y-1">
          {menuView.filter((m) => !m.hidden).map((m) => {
            const active = path.startsWith(m.href);

            const label = (
              <span className="inline-flex items-center gap-2">
                {m.label}
                {/* 배지: Basic / Premium 으로 표기 */}
                {m.isPaid && m.paidLabel && (
                  <span className="text-[10px] rounded px-1.5 py-0.5 border border-amber-300/60 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-900/20">
                    {m.paidLabel}
                  </span>
                )}
                {policyLoading && (
                  <span className="text-[10px] ml-1 opacity-60">로딩중</span>
                )}
              </span>
            );

            return (
              <li key={m.slug}>
                {m.isDisabled ? (
                  // 비활성: 클릭 차단(span)
                  <span
                    className={clsx(base, disabled)}
                    aria-disabled="true"
                    title={
                      policyLoading
                        ? '정책 로딩 중'
                        : (m.isPaid ? '구독 등급이 필요합니다' : '관리자에 의해 비활성화됨')
                    }
                  >
                    {label}
                  </span>
                ) : (
                  // 활성: 정상 링크
                  <Link href={m.href} className={clsx(base, enabled(active))}>
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
