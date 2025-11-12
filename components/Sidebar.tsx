'use client';

/**
 * Sidebar — 기존 구조 유지 + 티어 오버라이드(Basic/Premium 단일선택)
 * -------------------------------------------------------------------
 * - 기본 동작(하위 호환):
 *   · Firestore settings/uploadPolicy.navigation.disabled / navigation.paid 를 구독
 *   · paid 배열에 있으면 "유료" 배지 + 비구독자는 비활성
 * - 확장(신규):
 *   · navigation.tiers: { [slug]: "free"|"basic"|"premium" } 가 존재하면 우선 적용
 *   · tiers 미정의 시 paid 배열을 "basic"으로 간주
 * - 사용자:
 *   · users/{uid}.subscriptionTier 가 있으면 그 값을 사용("free"|"basic"|"premium")
 *   · 없으면 isSubscribed===true → "basic", 아니면 "free" (폴백)
 *   · 관리자(admin)는 항상 접근 가능
 * - 초기 로딩(policyLoading) 동안 일반 유저는 임시 비활성(기존 UX 보호)
 *
 * ⚠️ 최종 보안은 서버/미들웨어 가드에서 책임집니다(여기는 UX 차단).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';

import { auth, db } from '@/lib/firebase/firebase'; // ✅ 프로젝트의 기존 경로 유지
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

/** 메뉴 정의: slug는 관리자 설정과 1:1 매칭 */
type MenuItem = {
  slug: string;
  label: string;
  href: string;
  adminOnly?: boolean;   // 관리자 전용 메뉴는 일반 유저에게 숨김
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
type Tier = 'free' | 'basic' | 'premium';
type UploadPolicy = {
  navigation?: {
    disabled?: string[];  // 관리자 임의 비활성
    paid?: string[];      // 하위 호환: basic 으로 간주
    tiers?: Record<string, Tier>; // ✅ 신규: 티어 오버라이드 맵
  };
};

/** 정규화 유틸 */
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
  // 1) 로그인/프로필(역할·구독/티어) 구독
  // ───────────────────────────────
  const [signedIn, setSignedIn] = useState(false);
  const [role, setRole] = useState<'admin' | 'user'>('user'); // users/{uid}.role
  const [isSubscribed, setIsSubscribed] = useState(false);     // users/{uid}.isSubscribed (하위 호환)
  const [subscriptionTier, setSubscriptionTier] = useState<Tier>('free'); // "free"|"basic"|"premium"

  useEffect(() => {
    let unsubUser: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setSignedIn(!!u);

      if (!u) {
        // 로그아웃 상태 초기화
        setRole('user');
        setIsSubscribed(false);
        setSubscriptionTier('free');
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

          const nextIsSubscribed = Boolean(data.isSubscribed);
          // subscriptionTier 우선, 없으면 isSubscribed → basic, 아니면 free
          const nextTier: Tier =
            (['free', 'basic', 'premium'].includes(String(data.subscriptionTier)) 
              ? String(data.subscriptionTier) 
              : (nextIsSubscribed ? 'basic' : 'free')) as Tier;

          setIsSubscribed(nextIsSubscribed);
          setSubscriptionTier(nextTier);
        },
        () => {
          // 오류 시 안전 기본값
          setRole('user');
          setIsSubscribed(false);
          setSubscriptionTier('free');
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubUser) unsubUser();
    };
  }, []);

  // ───────────────────────────────
  // 2) 관리자 정책(비활성/유료/티어) 구독 + 로딩 상태
  // ───────────────────────────────
  const [policyLoading, setPolicyLoading] = useState(true);
  const [disabledSlugs, setDisabledSlugs] = useState<string[]>([]);
  const [paidSlugs, setPaidSlugs] = useState<string[]>([]); // 하위 호환: basic 으로 간주
  const [tiersMap, setTiersMap] = useState<Record<string, Tier>>({}); // ✅ 신규

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

        // paid (하위 호환: basic 간주)
        const rawPaid = Array.isArray(nav.paid) ? nav.paid : [];
        setPaidSlugs(rawPaid.map((s) => normalizeToInternalSlug(String(s))));

        // ✅ tiers 맵(신규)
        const rawTiers = nav.tiers ?? {};
        const nextTiers: Record<string, Tier> = {};
        Object.keys(rawTiers).forEach((k) => {
          const key = normalizeToInternalSlug(k);
          const val = String(rawTiers[k] || 'free').toLowerCase();
          nextTiers[key] = (val === 'basic' || val === 'premium') ? (val as Tier) : 'free';
        });
        setTiersMap(nextTiers);

        setPolicyLoading(false);
      },
      () => {
        // 스냅샷 오류 시 안전 기본값
        setDisabledSlugs([]);
        setPaidSlugs([]);
        setTiersMap({});
        setPolicyLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // ───────────────────────────────
  // 3) 메뉴 렌더 상태 계산
  // ───────────────────────────────
  const menuView = useMemo(() => {
    const isAdmin = role === 'admin';

    // 관리자면 최상위 권한으로 취급(모든 메뉴 활성)
    const effectiveUserTier: Tier = isAdmin ? 'premium' : subscriptionTier;

    return MENUS.map((m) => {
      // (A) 숨김: 관리자 전용
      const hidden = !!m.adminOnly && !isAdmin;

      // (B) 관리자 임의 비활성
      const disabledByAdmin = disabledSlugs.includes(m.slug);

      // (C) 요구 티어:
      //     · tiersMap 우선
      //     · 없으면 paidSlugs 포함 시 "basic"
      //     · 둘 다 없으면 "free"
      const required: Tier =
        tiersMap[m.slug] ?? (paidSlugs.includes(m.slug) ? 'basic' : 'free');

      // (D) 유료 배지 여부
      const isPaid = required !== 'free';

      // (E) 티어 불일치(정확 매칭) → 비활성
      //     - 포함형(Premium ⊃ Basic)을 원하면 조건 한 줄만 아래처럼 바꾸면 됨:
      //       const disabledByTier =
      //         (required === 'premium' && effectiveUserTier !== 'premium' && !isAdmin) ||
      //         (required === 'basic' && !['basic','premium'].includes(effectiveUserTier) && !isAdmin);
      const disabledByTier = required !== 'free' && required !== effectiveUserTier && !isAdmin;

      // (F) 정책 로딩 중 보호(일반 유저만): 초기 깜빡임/오동작 방지
      const disabledByLoading = policyLoading && !isAdmin;

      return {
        ...m,
        isPaid,
        hidden,
        isDisabled: disabledByAdmin || disabledByTier || disabledByLoading,
      };
    });
  }, [role, subscriptionTier, disabledSlugs, paidSlugs, tiersMap, policyLoading]);

  // ───────────────────────────────
  // 4) 렌더링(기존 스타일 유지)
  // ───────────────────────────────
  const base =
    'group block rounded-md px-3 py-2 text-sm transition select-none';
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
            const active = pathname.startsWith(m.href);

            const label = (
              <span className="inline-flex items-center gap-2">
                {m.label}
                {m.isPaid && (
                  <span className="text-[10px] rounded px-1.5 py-0.5 border border-amber-300/60 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-900/20">
                    유료
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
                  // 비활성: 클릭 차단(span 렌더)
                  <span
                    className={clsx(base, disabled)}
                    aria-disabled="true"
                    title={
                      policyLoading
                        ? '정책 로딩 중'
                        : (m.isPaid ? '구독이 필요합니다' : '관리자에 의해 비활성화됨')
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
