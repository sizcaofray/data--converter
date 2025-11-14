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
 *  - Firestore 규칙에 맞춰 DB는 읽기 위주지만,
 *    ✅ 이번에 추가한 부분에서 "만료된 일반 유저"는
 *       role을 free, isSubscribed를 false로 DB에 1회 보정합니다.
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
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
  { slug: 'cover', label: 'Cover', href: '/' },
  { slug: 'convert', label: 'Data Convert', href: '/convert' },
  { slug: 'compare', label: 'Data Compare', href: '/compare' },
  { slug: 'pattern-editor', label: 'Pattern Editor', href: '/pattern-editor' },
  { slug: 'randomizer', label: 'Randomizer', href: '/randomizer' },
  { slug: 'pdf-tool', label: 'PDF Tool', href: '/pdf' },
  { slug: 'admin', label: 'Admin', href: '/admin', adminOnly: true },
];

/** 문자열 정규화(소문자 + trim) */
const norm = (v: any): string => String(v ?? '').trim().toLowerCase();

/** settings/uploadPolicy 문서 구조 중, navigation 관련 부분만 정의 */
type UploadPolicy = {
  navigation?: {
    disabled?: string[]; // 강제 OFF 슬러그 목록
    paid?: string[];     // 유료(=basic) 메뉴 슬러그 목록(하위호환)
    tiers?: Record<string, Tier>; // slug → required tier
  };
};

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
        if (unsubUser) {
          unsubUser();
          unsubUser = null;
        }
        return;
      }

      const userRef = doc(db, 'users', u.uid);
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }
      unsubUser = onSnapshot(
        userRef,
        (snap) => {
          const data = snap.exists() ? (snap.data() as any) : {};

          // 1) 역할 판정
          const roleNorm = norm(data.role ?? 'user');
          const isAdmin = roleNorm === 'admin';
          setRole(isAdmin ? 'admin' : 'user');

          // 2) 구독/만료 판정
          const rawTier = norm(data.subscriptionTier ?? ''); // 읽기 전용(표기용)
          const isSubscribed = !!data.isSubscribed;

          // Firestore Timestamp → Date
          const endTs = data.subscriptionEndAt || null;
          const endDate: Date | null = endTs
            ? typeof endTs.toDate === 'function'
              ? endTs.toDate()
              : new Date(endTs)
            : null;

          // 만료 판단 (마지막 날 당일 포함)
          //  - 예: endDate=2025-11-13, 오늘=2025-11-13 → 사용 가능
          //        오늘=2025-11-14 → 만료
          const today = kstToday();
          const endOnly = endDate ? toUTCDateOnly(endDate) : null;
          const expired = !!endOnly && endOnly.getTime() < today.getTime();

          // 2-1) 만료된 유저의 DB 자동 보정
          //  - Admin이 아닌데 구독이 만료된 경우:
          //    · role              → 'free'
          //    · isSubscribed      → false
          //    · subscriptionStartAt / subscriptionEndAt → null
          //  - Firestore 규칙에서 허용된 범위 내에서만 동작(실패해도 UI 동작에는 영향 없음)
          if (expired && !isAdmin && (isSubscribed || roleNorm !== 'free')) {
            updateDoc(userRef, {
              role: 'free',
              isSubscribed: false,
              subscriptionStartAt: null,
              subscriptionEndAt: null,
            }).catch((e) => {
              console.error('만료 구독 자동 보정 실패:', e);
            });
          }

          // 3) Admin은 항상 Admin 티어(만료 무시)
          if (isAdmin) {
            setUserTier('admin');
            return;
          }

          // 4) 일반 유저의 실효 구독 = isSubscribed && !expired
          const activeSub = isSubscribed && !expired;

          // 5) 최종 사용자 티어 결정(표기 없는 유료는 basic로 취급)
          const tierFromSub: Tier =
            rawTier === 'premium'
              ? activeSub
                ? 'premium'
                : 'free'
              : rawTier === 'basic'
              ? activeSub
                ? 'basic'
                : 'free'
              : activeSub
              ? 'basic'
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
        const normTiers: Record<string, Tier> = {};
        for (const [k, v] of Object.entries(rawTiers)) {
          const slug = normalizeToInternalSlug(String(k));
          const tierNorm = norm(v);
          const valid =
            tierNorm === 'free' ||
            tierNorm === 'basic' ||
            tierNorm === 'premium' ||
            tierNorm === 'admin';
          if (!slug || !valid) continue;
          normTiers[slug] = tierNorm as Tier;
        }
        setTiersMap(normTiers);

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

  /* ───────── 메뉴 뷰 모델 ───────── */
  const menuView = useMemo(() => {
    const path = pathname ?? '';

    return MENUS.map((m) => {
      const slug = normalizeToInternalSlug(m.slug);
      const isAdmin = role === 'admin';

      // Admin 전용 메뉴는 관리자만 보이게
      if (m.adminOnly && !isAdmin) {
        return { ...m, hidden: true, required: 'admin' as Tier, paidLabel: 'Admin' };
      }

      // 정책 로딩 중에는 기본 free로 취급 (플리커 방지)
      const requiredTier: Tier = tiersMap[slug] ?? (paidSlugs.includes(slug) ? 'basic' : 'free');

      // 강제 OFF
      const disabledByAdmin = disabledSlugs.includes(slug);

      // 배지 라벨
      const paidLabel =
        requiredTier === 'admin'
          ? 'Admin'
          : requiredTier === 'premium'
          ? 'Premium'
          : requiredTier === 'basic'
          ? 'Basic'
          : '';

      // 사용자 티어가 요구 티어를 만족하는지
      const tierRank = (t: Tier) =>
        t === 'free' ? 0 : t === 'basic' ? 1 : t === 'premium' ? 2 : 3;
      const canUse = tierRank(userTier) >= tierRank(requiredTier);

      // 최종 hidden/disabled
      const hidden = false; // Admin 전용 처리만 위에서 함
      const disabled = disabledByAdmin || !canUse;

      return {
        ...m,
        required: requiredTier,
        paidLabel,
        hidden,
        disabled,
        active: path.startsWith(m.href),
      };
    });
  }, [pathname, role, userTier, disabledSlugs, paidSlugs, tiersMap]);

  /* ───────── 렌더 ───────── */
  const path = pathname ?? '';

  const base =
    'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors';
  const enabled = (active: boolean) =>
    active
      ? 'bg-blue-600 text-white'
      : 'text-gray-900 dark:text-white hover:bg-blue-100/70 dark:hover:bg-blue-800/40';
  const disabledCls = 'opacity-40 cursor-not-allowed';

  return (
    <aside className="w-64 shrink-0">
      <div className="px-3 py-3 text-xs uppercase tracking-wider opacity-60">Menu</div>

      <nav className="px-2 pb-4">
        <ul className="space-y-1">
          {menuView
            .filter((m) => !m.hidden)
            .map((m) => {
              const label = (
                <span className="inline-flex items-center gap-2">
                  {m.label}
                  {m.paidLabel && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-blue-500 text-blue-600 dark:text-blue-300">
                      {m.paidLabel}
                    </span>
                  )}
                </span>
              );

              if (m.disabled) {
                return (
                  <li key={m.slug}>
                    <button className={`${base} ${disabledCls}`} disabled>
                      {label}
                    </button>
                  </li>
                );
              }

              return (
                <li key={m.slug}>
                  <Link href={m.href} className={`${base} ${enabled(path.startsWith(m.href))}`}>
                    {label}
                  </Link>
                </li>
              );
            })}
        </ul>
      </nav>
    </aside>
  );
}

/** slug를 내부 슬러그로 정규화 */
function normalizeToInternalSlug(s: string): string {
  const v = norm(s);
  if (v === 'pdf') return 'pdf-tool';
  if (v === 'pattern') return 'pattern-editor';
  return v;
}
