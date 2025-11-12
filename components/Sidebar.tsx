'use client';

/**
 * Sidebar — 티어 포함 규칙 + role(basic/premium) 우선 반영 + 배지 표기(Basic/Premium)
 * -----------------------------------------------------------------------------
 * 데이터 소스
 * - users/{uid}:
 *    · role: 'admin' | 'premium' | 'basic' | 'user' (basic/premium이면 최우선 티어로 인정)
 *    · isSubscribed: boolean (하위 호환 → true면 기본적으로 'basic')
 *    · subscriptionTier: 'premium' | 'basic' | 'free' (있으면 그대로 사용)
 *
 * - settings/uploadPolicy:
 *    · navigation.disabled: string[]  → 보이되 클릭 차단
 *    · navigation.paid: string[]      → 하위 호환(= basic 취급)
 *    · navigation.tiers: { [slug]: 'free'|'basic'|'premium' } → 우선 적용
 *
 * 규칙
 * - 포함 규칙: premium ⊃ basic ⊃ free
 * - 관리자(role==='admin')는 항상 premium로 취급(전 메뉴 활성)
 * - 배지: requiredTier가 'basic'이면 'Basic', 'premium'이면 'Premium'
 * - 초기 policy 로딩 동안 일반 유저는 임시 비활성(깜빡임/오동작 방지)
 * - 최종 권한 검증은 서버/미들웨어로 보강 권장(여긴 UX 차단)
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';

// ⚠ 프로젝트의 기존 Firebase 클라이언트 경로를 그대로 사용하세요.
import { auth, db } from '@/lib/firebase/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

type Tier = 'free' | 'basic' | 'premium';

type MenuItem = {
  slug: string;
  label: string;
  href: string;
  adminOnly?: boolean; // 관리자 전용(일반 사용자에겐 숨김)
};

const MENUS: MenuItem[] = [
  { slug: 'convert',         label: 'Data Convert',   href: '/convert' },
  { slug: 'compare',         label: 'Compare',        href: '/compare' },
  { slug: 'pdf-tool',        label: 'PDF Tool',       href: '/pdf-tool' },
  { slug: 'pattern-editor',  label: 'Pattern Editor', href: '/pattern-editor' },
  { slug: 'random',          label: 'Random',         href: '/random' },
  { slug: 'admin',           label: 'Admin',          href: '/admin', adminOnly: true },
];

type UploadPolicy = {
  navigation?: {
    disabled?: string[];
    paid?: string[]; // 하위 호환(= basic 취급)
    tiers?: Record<string, Tier>; // 우선 적용
  };
};

const norm = (v: string) => String(v || '').trim().toLowerCase();

/** 과거 키 혼재 대응: 'pdf' → 'pdf-tool', 'pattern' → 'pattern-editor' */
function normalizeToInternalSlug(input: string): string {
  const s = norm(input);
  if (s === 'pdf') return 'pdf-tool';
  if (s === 'pattern') return 'pattern-editor';
  return s;
}

export default function Sidebar() {
  const pathname = usePathname();

  // ───────────────────────────────
  // 1) 사용자 인증/역할/티어 파생
  // ───────────────────────────────
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [userTier, setUserTier] = useState<Tier>('free'); // 최종 파생된 사용자 티어

  useEffect(() => {
    let unsubUser: null | (() => void) = null;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setRole('user');
        setUserTier('free');
        if (unsubUser) { unsubUser(); unsubUser = null; }
        return;
      }

      const userRef = doc(db, 'users', u.uid);
      if (unsubUser) { unsubUser(); unsubUser = null; }
      unsubUser = onSnapshot(
        userRef,
        (snap) => {
          const data = snap.exists() ? (snap.data() as any) : {};

          // 1) 역할 판정(관리자/일반)
          const roleNorm = norm(data.role ?? 'user');
          const nextRole: 'admin' | 'user' = roleNorm === 'admin' ? 'admin' : 'user';
          setRole(nextRole);

          // 2) 구독/티어 파생
          const isSubscribed = !!data.isSubscribed;               // 하위 호환
          const rawTier = norm(data.subscriptionTier ?? '');      // 'premium'|'basic'|'free'|''

          // ✅ role이 'premium'|'basic'이면 최우선으로 티어 인정
          const tierFromRole: Tier =
            roleNorm === 'premium' ? 'premium' :
            roleNorm === 'basic'   ? 'basic'   :
            (null as unknown as Tier); // 역할에서 티어 안 주면 null 의미

          // subscriptionTier가 유효하면 사용, 없으면 isSubscribed로 basic 폴백
          const tierFromSub: Tier =
            rawTier === 'premium' ? 'premium' :
            rawTier === 'basic'   ? 'basic'   :
            isSubscribed          ? 'basic'   :
            'free';

          const derived: Tier = tierFromRole ?? tierFromSub;

          // 관리자는 항상 premium 취급
          setUserTier(nextRole === 'admin' ? 'premium' : derived);
        },
        () => {
          setRole('user');
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
  // 2) 정책 문서 구독
  // ───────────────────────────────
  const [policyLoading, setPolicyLoading] = useState(true);
  const [disabledSlugs, setDisabledSlugs] = useState<string[]>([]);
  const [paidSlugs, setPaidSlugs] = useState<string[]>([]); // tiers 없을 때만 basic으로 간주
  const [tiersMap, setTiersMap] = useState<Record<string, Tier>>({}); // 우선 적용

  useEffect(() => {
    setPolicyLoading(true);
    const ref = doc(db, 'settings', 'uploadPolicy');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.exists() ? (snap.data() as UploadPolicy) : {}) || {};
        const nav = data.navigation ?? {};

        const rawDisabled = Array.isArray(nav.disabled) ? nav.disabled : [];
        setDisabledSlugs(rawDisabled.map((s) => normalizeToInternalSlug(String(s))));

        const rawPaid = Array.isArray(nav.paid) ? nav.paid : [];
        setPaidSlugs(rawPaid.map((s) => normalizeToInternalSlug(String(s))));

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
        setDisabledSlugs([]);
        setPaidSlugs([]);
        setTiersMap({});
        setPolicyLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // ───────────────────────────────
  // 3) 메뉴 렌더 상태 계산(포함 규칙 + 배지 표기)
  // ───────────────────────────────
  const menuView = useMemo(() => {
    const isAdmin = role === 'admin';
    const effectiveUserTier: Tier = isAdmin ? 'premium' : userTier;

    return MENUS.map((m) => {
      // (A) 관리자 전용 숨김
      const hidden = !!m.adminOnly && !isAdmin;

      // (B) 관리자 임의 비활성
      const disabledByAdmin = disabledSlugs.includes(m.slug);

      // (C) 요구 티어: tiers 우선, 없으면 paid → 'basic', 없다면 'free'
      const required: Tier =
        tiersMap[m.slug] ?? (paidSlugs.includes(m.slug) ? 'basic' : 'free');

      // (D) 배지 문구(Basic/Premium)
      const isPaid = required !== 'free';
      const paidLabel = required === 'premium' ? 'Premium' : (required === 'basic' ? 'Basic' : '');

      // (E) 포함 규칙:
      //     premium ⊃ basic ⊃ free
      const disabledByTier =
        (required === 'premium' && effectiveUserTier !== 'premium' && !isAdmin) ||
        (required === 'basic'   && !['basic', 'premium'].includes(effectiveUserTier) && !isAdmin);
      // free는 항상 활성

      // (F) 정책 로딩 중 일반 유저 임시 차단
      const disabledByLoading = policyLoading && !isAdmin;

      return {
        ...m,
        required,
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
