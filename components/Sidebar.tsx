'use client';

/**
 * Sidebar — 규칙 준수(읽기만), 티어 포함 규칙, role 우선, 배지 표기
 * - Firestore rules: users 문서는 읽기만, 쓰기 없음 → 본 컴포넌트는 읽기 전용
 * - 티어 결정:
 *   1) role이 'admin'이면 항상 premium
 *   2) role이 'premium'|'basic'이면 그에 맞춰 티어 우선
 *   3) 그 외 subscriptionTier(읽기만) → 없으면 isSubscribed=true면 basic, 아니면 free
 * - 메뉴 정책: settings/uploadPolicy 를 구독 (navigation.disabled / navigation.tiers / paid[하위호환])
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/firebase';

type Tier = 'free' | 'basic' | 'premium';

type MenuItem = {
  slug: string;
  label: string;
  href: string;
  adminOnly?: boolean;
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
    tiers?: Record<string, Tier>;
  };
  subscribeButtonEnabled?: boolean;
};

const norm = (v: string) => String(v || '').trim().toLowerCase();

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
          const rawTier = norm(data.subscriptionTier ?? '');   // 읽기만 (써선 안 됨)

          const tierFromRole: Tier | null =
            roleNorm === 'premium' ? 'premium' :
            roleNorm === 'basic'   ? 'basic'   : null;

          const tierFromSub: Tier =
            rawTier === 'premium' ? 'premium' :
            rawTier === 'basic'   ? 'basic'   :
            isSubscribed          ? 'basic'   :
            'free';

          const derived: Tier = (tierFromRole ?? tierFromSub);
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

  // 메뉴 상태 계산
  const menuView = useMemo(() => {
    const isAdmin = role === 'admin';
    const effectiveUserTier: Tier = isAdmin ? 'premium' : userTier;

    return MENUS.map((m) => {
      const hidden = !!m.adminOnly && !isAdmin;
      const disabledByAdmin = disabledSlugs.includes(m.slug);

      const required: Tier =
        tiersMap[m.slug] ?? (paidSlugs.includes(m.slug) ? 'basic' : 'free');

      const isPaid = required !== 'free';
      const paidLabel = required === 'premium' ? 'Premium' : (required === 'basic' ? 'Basic' : '');

      const disabledByTier =
        (required === 'premium' && effectiveUserTier !== 'premium' && !isAdmin) ||
        (required === 'basic'   && !['basic', 'premium'].includes(effectiveUserTier) && !isAdmin);

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
                {m.isPaid && m.paidLabel && (
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
