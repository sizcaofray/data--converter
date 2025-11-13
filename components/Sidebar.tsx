'use client';

/**
 * Sidebar — 구독 만료 자동 비활성화 + Admin 티어 + 기존 UI/정책 유지
 *
 * 핵심:
 *  - users/{uid} 문서의 role, isSubscribed, subscriptionEndAt을 읽어
 *    KST(UTC+9) 자정 기준으로 "만료" 여부를 계산합니다.
 *  - 만료되면 isSubscribed가 true여도 실효 구독을 false로 간주 → basic/premium 메뉴 비활성화.
 *  - required === 'admin' 메뉴는 관리자만 표시(비관리자에겐 숨김).
 *  - settings/uploadPolicy 의 navigation.disabled / navigation.paid / navigation.tiers 로직 유지.
 *
 * 주의:
 *  - Firestore 규칙에 맞춰 DB는 읽기만 하며, 상태 판정은 클라이언트에서 수행합니다.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/firebase';

/** 구독 티어 정의 */
type Tier = 'free' | 'basic' | 'premium' | 'admin';

type MenuItem = {
  slug: string;     // 내부 식별자
  label: string;    // 표시명
  href: string;     // 이동 경로
  adminOnly?: boolean; // Admin 메뉴 자체는 관리자 전용
};

/** 실제 노출 메뉴(기존 유지) */
const MENUS: MenuItem[] = [
  { slug: 'convert',         label: 'Data Convert',   href: '/convert' },
  { slug: 'compare',         label: 'Compare',        href: '/compare' },
  { slug: 'pdf-tool',        label: 'PDF Tool',       href: '/pdf-tool' },
  { slug: 'pattern-editor',  label: 'Pattern Editor', href: '/pattern-editor' },
  { slug: 'random',          label: 'Random',         href: '/random' },
  { slug: 'admin',           label: 'Admin',          href: '/admin', adminOnly: true },
];

/** 업로드 정책 스키마 */
type UploadPolicy = {
  navigation?: {
    disabled?: string[];                 // 강제 OFF 목록
    paid?: string[];                     // (하위호환) 유료 목록 → 기본 basic 취급
    tiers?: Record<string, Tier>;        // slug별 요구 티어: 'free'|'basic'|'premium'|'admin'
  };
  subscribeButtonEnabled?: boolean;
};

/** 문자열 정규화 */
const norm = (v: string) => String(v || '').trim().toLowerCase();

/** 과거 키 → 내부 slug로 정규화 */
function normalizeToInternalSlug(input: string): string {
  const s = norm(input);
  if (s === 'pdf') return 'pdf-tool';
  if (s === 'pattern') return 'pattern-editor';
  return s;
}

/* ───────────── 날짜 유틸: KST 자정 기준 ───────────── */

/** Date를 ‘연-월-일만 남긴’ UTC 기준으로 정리 */
const toUTCDateOnly = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** 지금 시간을 KST로 변환 후, ‘연-월-일만 남긴’ UTC Date로 반환 */
const kstToday = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000); // KST = UTC+9
  return toUTCDateOnly(kst);
};

export default function Sidebar() {
  const pathname = usePathname();

  // 사용자 역할/티어(파생, 읽기 전용)
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [userTier, setUserTier] = useState<Tier>('free');

  /* ───────── 사용자 스냅샷: role / 구독 만료 반영 ───────── */
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

          // 1) 역할 판정
          const roleNorm = norm(data.role ?? 'user');
          const isAdmin = roleNorm === 'admin';
          setRole(isAdmin ? 'admin' : 'user');

          // 2) 구독/만료 판정
          const rawTier = norm(data.subscriptionTier ?? '');  // 읽기 전용(표기용)
          const isSubscribed = !!data.isSubscribed;

          // Firestore Timestamp → Date
          const endTs = data.subscriptionEndAt || null;
          const endDate: Date | null = endTs
            ? (typeof endTs.toDate === 'function' ? endTs.toDate() : new Date(endTs))
            : null;

          // 만료 판단 (마지막 날 당일 포함)
          //  - 예: endDate=2025-11-13, 오늘=2025-11-13 → 사용 가능
          //        오늘=2025-11-14 → 만료
          const today = kstToday();
          const endOnly = endDate ? toUTCDateOnly(endDate) : null;
          const expired = !!endOnly && endOnly.getTime() < today.getTime();

          // 3) Admin은 항상 Admin 티어(만료 무시)
          if (isAdmin) {
            setUserTier('admin');
            return;
          }

          // 4) 일반 유저의 실효 구독 = isSubscribed && !expired
          const activeSub = isSubscribed && !expired;

          // 5) 최종 사용자 티어 결정(표기 없는 유료는 basic로 취급)
          const tierFromSub: Tier =
            rawTier === 'premium' ? (activeSub ? 'premium' : 'free')
          : rawTier === 'basic'   ? (activeSub ? 'basic'   : 'free')
          : activeSub             ? 'basic'
                                  : 'free';

          setUserTier(tierFromSub);
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

  /* ───────── 정책 스냅샷: disabled/paid/tiers ───────── */
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

        // 강제 OFF
        const rawDisabled = Array.isArray(nav.disabled) ? nav.disabled : [];
        setDisabledSlugs(rawDisabled.map((s) => normalizeToInternalSlug(String(s))));

        // (하위호환) paid → basic 취급
        const rawPaid = Array.isArray(nav.paid) ? nav.paid : [];
        setPaidSlugs(rawPaid.map((s) => normalizeToInternalSlug(String(s))));

        // tiers: free/basic/premium/admin
        const rawTiers = nav.tiers ?? {};
        const nextTiers: Record<string, Tier> = {};
        Object.keys(rawTiers).forEach((k) => {
          const key = normalizeToInternalSlug(k);
          const v = norm(String(rawTiers[k] ?? 'free'));
          nextTiers[key] =
            v === 'admin'   ? 'admin'   :
            v === 'premium' ? 'premium' :
            v === 'basic'   ? 'basic'   : 'free';
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

  /* ───────── 메뉴 표시/활성화 상태 계산 ───────── */
  const menuView = useMemo(() => {
    const isAdmin = role === 'admin';
    const effectiveUserTier: Tier = isAdmin ? 'admin' : userTier;

    return MENUS.map((m) => {
      // Admin 메뉴 자체는 관리자 전용
      const hiddenByAdminOnly = !!m.adminOnly && !isAdmin;

      // 강제 OFF
      const disabledByAdmin = disabledSlugs.includes(m.slug);

      // 요구 티어: tiersMap > paid(=basic) > free
      const required: Tier =
        tiersMap[m.slug]
          ?? (paidSlugs.includes(m.slug) ? 'basic' : 'free');

      // 배지 라벨
      const paidLabel =
        required === 'admin'   ? 'Admin'   :
        required === 'premium' ? 'Premium' :
        required === 'basic'   ? 'Basic'   : '';

      // Admin 전용은 비관리자에게 숨김
      const hiddenByTier = (required === 'admin') && !isAdmin;

      // 등급 미충족 시 비활성화(표시는 하되 클릭 불가)
      const disabledByTier =
        (required === 'premium' && !['premium', 'admin'].includes(effectiveUserTier)) ||
        (required === 'basic'   && !['basic', 'premium', 'admin'].includes(effectiveUserTier));

      const disabledByLoading = policyLoading && !isAdmin;

      return {
        ...m,
        required,
        paidLabel,
        hidden: hiddenByAdminOnly || hiddenByTier,
        isDisabled: !hiddenByAdminOnly && !hiddenByTier && (disabledByAdmin || disabledByTier || disabledByLoading),
      };
    });
  }, [role, userTier, disabledSlugs, paidSlugs, tiersMap, policyLoading]);

  /* ───────── 렌더 ───────── */
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
