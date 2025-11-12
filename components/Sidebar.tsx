'use client';

/**
 * Sidebar — 티어에 admin 추가
 * - required: 'admin' 인 메뉴는 관리자만 표시(비관리자에게는 숨김)
 * - 그 외 로직/디자인은 기존 유지
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/firebase';

/** 티어: admin 추가 */
type Tier = 'free' | 'basic' | 'premium' | 'admin';

type MenuItem = {
  slug: string;
  label: string;
  href: string;
  adminOnly?: boolean; // 기존 유지: Admin 메뉴 자체는 관리자 전용
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
    paid?: string[]; // 하위 호환: basic 취급
    tiers?: Record<string, Tier>; // 이제 'admin' 값도 올 수 있음
  };
  subscribeButtonEnabled?: boolean;
};

const norm = (v: string) => String(v || '').trim().toLowerCase();

/** 외부/과거 키를 내부 slug로 정규화 */
function normalizeToInternalSlug(input: string): string {
  const s = norm(input);
  if (s === 'pdf') return 'pdf-tool';
  if (s === 'pattern') return 'pattern-editor';
  return s;
}

export default function Sidebar() {
  const pathname = usePathname();

  // 사용자 역할/티어 파생 (읽기 전용)
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [userTier, setUserTier] = useState<Tier>('free');

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

          const roleNorm = norm(data.role ?? 'user');
          const nextRole: 'admin' | 'user' = roleNorm === 'admin' ? 'admin' : 'user';
          setRole(nextRole);

          const isSubscribed = !!data.isSubscribed;            // 규칙 허용 필드(읽기)
          const rawTier = norm(data.subscriptionTier ?? '');   // 읽기만

          // role 기반 우선 티어 (admin, premium, basic만 영향)
          const tierFromRole: Tier | null =
            roleNorm === 'admin'   ? 'admin'   :
            roleNorm === 'premium' ? 'premium' :
            roleNorm === 'basic'   ? 'basic'   : null;

          // 구독 기반 파생(없으면 free)
          const tierFromSub: Tier =
            rawTier === 'admin'   ? 'admin'   :
            rawTier === 'premium' ? 'premium' :
            rawTier === 'basic'   ? 'basic'   :
            isSubscribed          ? 'basic'   :
            'free';

          const derived: Tier = (tierFromRole ?? tierFromSub);
          setUserTier(nextRole === 'admin' ? 'admin' : derived);
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

  // 정책 구독
  const [policyLoading, setPolicyLoading] = useState(true);
  const [disabledSlugs, setDisabledSlugs] = useState<string[]>([]);
  const [paidSlugs, setPaidSlugs] = useState<string[]>([]);
  const [tiersMap, setTiersMap] = useState<Record<string, Tier>>({});

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

        // tiers: free/basic/premium/admin 허용
        const rawTiers = nav.tiers ?? {};
        const nextTiers: Record<string, Tier> = {};
        Object.keys(rawTiers).forEach((k) => {
          const key = normalizeToInternalSlug(k);
          const v = norm(String(rawTiers[k] ?? 'free'));
          nextTiers[key] =
            v === 'admin'   ? 'admin'   :
            v === 'premium' ? 'premium' :
            v === 'basic'   ? 'basic'   :
            'free';
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

  // 메뉴 상태 계산
  const menuView = useMemo(() => {
    const isAdmin = role === 'admin';
    const effectiveUserTier: Tier = isAdmin ? 'admin' : userTier;

    return MENUS.map((m) => {
      // 기존: Admin 메뉴 자체는 관리자 전용
      const hiddenByAdminOnly = !!m.adminOnly && !isAdmin;

      // 관리자 비활성화(OFF)
      const disabledByAdmin = disabledSlugs.includes(m.slug);

      // 요구 티어: tiersMap > paid(=basic) > free
      const required: Tier =
        tiersMap[m.slug]
          ?? (paidSlugs.includes(m.slug) ? 'basic' : 'free');

      // 배지 라벨
      const paidLabel =
        required === 'admin'   ? 'Admin'   :
        required === 'premium' ? 'Premium' :
        required === 'basic'   ? 'Basic'   :
        '';

      // 티어 미충족 여부 (admin 전용은 관리자만 표시)
      const hiddenByTier =
        required === 'admin' && !isAdmin;

      const disabledByTier =
        required === 'premium' && !['premium', 'admin'].includes(effectiveUserTier)
        || required === 'basic'   && !['basic', 'premium', 'admin'].includes(effectiveUserTier);

      const disabledByLoading = policyLoading && !isAdmin;

      return {
        ...m,
        required,
        paidLabel,
        hidden: hiddenByAdminOnly || hiddenByTier, // admin 전용은 비관리자에게 숨김
        isDisabled: !hiddenByAdminOnly && !hiddenByTier && (disabledByAdmin || disabledByTier || disabledByLoading),
      };
    });
  }, [role, userTier, disabledSlugs, paidSlugs, tiersMap, policyLoading]);

  // 렌더
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
                {m.paidLabel && (
                  <span className="text-[10px] rounded px-1.5 py-0.5 border border-amber-300/60 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-900/20">
                    {m.paidLabel}
                  </span>
                )}
                {policyLoading && <span className="text-[10px] ml-1 opacity-60">로딩중</span>}
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
                        : (m.required === 'free'
                            ? '관리자에 의해 비활성화됨'
                            : m.required === 'admin'
                              ? '관리자 전용 메뉴입니다'
                              : '구독 등급이 필요합니다')
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
