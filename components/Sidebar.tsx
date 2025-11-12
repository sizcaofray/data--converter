'use client';

/**
 * Sidebar — 기존 기능 유지 + 티어 오버라이드(minimal change)
 * -------------------------------------------------------------------
 * - Firestore: settings/uploadPolicy 문서의
 *     · navigation.disabled  (기존 유지)
 *     · navigation.paid      (기존 유지, 하위 호환: basic 간주)
 *     · navigation.tiers     (신규: { [slug]: 'free'|'basic'|'premium' })
 *   을 구독하여 메뉴 상태를 계산합니다.
 *
 * - 비구독자/일반유저:
 *     · requiredTier === 'free' 인 메뉴는 활성
 *     · requiredTier === 'basic' | 'premium' 인 메뉴는 "보이되 비활성(클릭 차단)"
 *     · 정책 스냅샷 도착 전(policyLoading)에는 임시로 비활성 → 초기 클릭 리다이렉트/깜빡임 방지
 * - 관리자(admin) 또는 적합한 구독티어 사용자는 해당 메뉴 활성
 * - 관리자 전용 메뉴(adminOnly)는 일반 유저에겐 숨김
 * - 슬러그 정규화: 'pdf' -> 'pdf-tool', 'pattern' -> 'pattern-editor' (기존 호환)
 *
 * ⚠️ 주의: 보안 가드는 서버/미들웨어에서 최종 검증해야 합니다.
 *          본 컴포넌트는 "UX상 클릭 차단" 역할을 수행합니다.
 */

import Link from 'next/link';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { db } from '@/lib/firebaseClient';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';

/** 메뉴 정의(현 프로젝트 기준 — 필요 시 key/label/href만 추가하세요) */
type MenuKey =
  | 'convert'
  | 'pdf-tool'
  | 'compare'
  | 'pattern-editor'
  | 'random'
  | 'admin';

type MenuItemDef = {
  key: MenuKey;
  label: string;
  href: string;
  adminOnly?: boolean; // 관리자 전용 메뉴(일반 유저에게 숨김)
};

// ⚠️ 디자인/마크업은 변경하지 않기 위해, 기존 렌더 구조를 유지합니다.
// 필요 시 여기 배열에 "한 줄 추가"만으로 메뉴가 늘어납니다.
const MENUS: MenuItemDef[] = [
  { key: 'convert',        label: 'Data Convert',    href: '/convert' },
  { key: 'pdf-tool',       label: 'PDF Tool',        href: '/pdf' },
  { key: 'compare',        label: 'Compare',         href: '/compare' },
  { key: 'pattern-editor', label: 'Pattern Editor',  href: '/pattern-editor' },
  { key: 'random',         label: 'Random',          href: '/random' },
  { key: 'admin',          label: 'Admin',           href: '/admin', adminOnly: true },
];

/** Firestore settings/uploadPolicy 문서 타입(기존 + tiers 추가) */
type UploadPolicy = {
  navigation?: {
    disabled?: string[];  // 관리자 임의 비활성화 목록(기존)
    paid?: string[];      // 유료화 목록(기존) — 하위 호환: basic로 간주
    tiers?: Record<string, 'free' | 'basic' | 'premium'>; // ✅ 신규: 티어 오버라이드 맵
  };
};

/** 공통: 소문자·트림 정규화 */
const norm = (v: string) => String(v || '').trim().toLowerCase();

/** 과거 키 혼재 대응: 'pdf'/'pattern' → 내부 기준 슬러그로 통일(기존 유지) */
function normalizeToInternalSlug(input: string) {
  const v = norm(input);
  if (v === 'pdf') return 'pdf-tool';
  if (v === 'pattern') return 'pattern-editor';
  return v;
}

/** 사용자 티어 타입 */
type Tier = 'free' | 'basic' | 'premium';

export default function Sidebar() {
  // -----------------------------
  // 1) 인증/사용자 구독 상태
  // -----------------------------
  const [signedIn, setSignedIn] = useState(false);
  const [role, setRole] = useState<'admin' | 'user' | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [userTier, setUserTier] = useState<Tier>('free'); // 파생: subscriptionTier ?? (isSubscribed ? 'basic' : 'free')

  // -----------------------------
  // 2) 관리자 정책(비활성/유료/티어) 구독
  // -----------------------------
  const [policyLoading, setPolicyLoading] = useState(true);
  const [disabledSlugs, setDisabledSlugs] = useState<string[]>([]);
  const [paidSlugs, setPaidSlugs] = useState<string[]>([]); // 하위 호환(없어지지 않음)
  const [tiersMap, setTiersMap] = useState<Record<string, Tier>>({}); // 신규: { slug: 'free'|'basic'|'premium' }

  // -----------------------------
  // 3) 마운트 시 인증 상태 및 사용자 문서 구독
  // -----------------------------
  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSignedIn(false);
        setRole(null);
        setIsSubscribed(false);
        setUserTier('free'); // 비로그인은 free
        return;
      }

      setSignedIn(true);

      // users/{uid} 실시간 반영(역할/구독)
      const userRef = doc(db, 'users', user.uid);
      const unsubUser = onSnapshot(userRef, (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {};
        const nextRole = (data.role as 'admin' | 'user') ?? 'user';
        const nextIsSubscribed = !!data.isSubscribed;
        // premium이 필요하면 사용자 문서에 subscriptionTier를 저장하세요(없으면 폴백)
        const nextTier: Tier =
          (data.subscriptionTier as Tier) ?? (nextIsSubscribed ? 'basic' : 'free');

        setRole(nextRole);
        setIsSubscribed(nextIsSubscribed);
        setUserTier(nextRole === 'admin' ? 'premium' : nextTier); // 관리자는 최상위로 취급
      });

      return () => unsubUser();
    });

    return () => unsub();
  }, []);

  // -----------------------------
  // 4) 정책 문서(settings/uploadPolicy) 실시간 구독
  // -----------------------------
  useEffect(() => {
    const ref = doc(db, 'settings', 'uploadPolicy');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.exists() ? (snap.data() as UploadPolicy) : {}) || {};
        const nav = data.navigation ?? {};

        // disabled 슬러그 정규화
        const rawDisabled = Array.isArray(nav.disabled) ? nav.disabled : [];
        const normalizedDisabled = rawDisabled.map((s) => normalizeToInternalSlug(String(s)));
        setDisabledSlugs(normalizedDisabled);

        // paid 슬러그 정규화(하위 호환)
        const rawPaid = Array.isArray(nav.paid) ? nav.paid : [];
        const normalizedPaid = rawPaid.map((s) => normalizeToInternalSlug(String(s)));
        setPaidSlugs(normalizedPaid);

        // ✅ tiers 맵(신규) — 없으면 빈 맵
        const rawTiers = nav.tiers ?? {};
        const nextTiers: Record<string, Tier> = {};
        Object.keys(rawTiers || {}).forEach((k) => {
          const key = normalizeToInternalSlug(k);
          const val = String(rawTiers[k] || 'free').toLowerCase();
          if (val === 'basic' || val === 'premium') nextTiers[key] = val;
          else nextTiers[key] = 'free';
        });
        setTiersMap(nextTiers);

        setPolicyLoading(false);
      },
      () => {
        // 에러 시에도 로딩 막기(UX 차단 방지)
        setPolicyLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // -----------------------------
  // 5) 렌더용 계산: hidden/isDisabled/isPaid
  // -----------------------------
  const menuView = useMemo(() => {
    // 관리자는 항상 모든 메뉴 접근 가능
    const isAdmin = role === 'admin';
    const canSeeAll = isAdmin;

    return MENUS.map((m) => {
      // (A) 관리자 전용 숨김
      const hidden = !!m.adminOnly && !isAdmin;

      // (B) 관리자 임의 비활성화(정책)
      const disabledByAdmin = disabledSlugs.includes(m.key);

      // (C) 요구 티어 계산
      //     - tiersMap 우선
      //     - 없으면 paidSlugs에 있으면 'basic'으로 간주(하위 호환)
      //     - 둘 다 없으면 'free'
      const required: Tier =
        tiersMap[m.key] ?? (paidSlugs.includes(m.key) ? 'basic' : 'free');

      // (D) 유료 뱃지 여부
      const isPaid = required !== 'free';

      // (E) 티어 불일치로 인한 비활성(정확 매칭)
      //     - 포함형(프리미엄이 베이직 포함)을 원하면 아래 조건만 한 줄 변경:
      //       const disabledByTier = (required === 'premium' && userTier !== 'premium' && !canSeeAll)
      //         || (required === 'basic' && !['basic','premium'].includes(userTier) && !canSeeAll);
      const disabledByTier = required !== 'free' && required !== userTier && !canSeeAll;

      // (F) 정책/유저 로딩 중 임시 비활성(초기 클릭 오동작 방지)
      const disabledByLoading = policyLoading && !canSeeAll;

      return {
        ...m,
        hidden,
        isPaid,
        isDisabled: disabledByAdmin || disabledByTier || disabledByLoading,
      };
    });
  }, [role, userTier, disabledSlugs, paidSlugs, tiersMap, policyLoading]);

  // -----------------------------
  // 6) 렌더(디자인/마크업 유지)
  // -----------------------------
  const base =
    'block w-full rounded px-3 py-2 transition-colors';
  const enabled =
    'hover:bg-gray-100 dark:hover:bg-gray-800';
  const disabled =
    'opacity-50 cursor-not-allowed';

  return (
    <aside className="w-64 border-r p-4">
      <nav className="space-y-1">
        <ul className="flex flex-col gap-1">
          {menuView.map((m) => {
            if (m.hidden) return null;

            // 라벨 오른쪽에 유료 뱃지(기존 스타일 유지, 필요 시 클래스만 조정)
            const label = (
              <span className="inline-flex items-center gap-2">
                <span>{m.label}</span>
                {m.isPaid && (
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    {tiersMap[m.key] === 'premium' ? 'Premium' : 'Basic'}
                  </span>
                )}
              </span>
            );

            return (
              <li key={m.key}>
                {m.isDisabled ? (
                  // 비활성: 클릭 차단(UX만), href 노출하지 않음
                  <span className={clsx(base, disabled)} aria-disabled="true">
                    {label}
                  </span>
                ) : (
                  // 활성: 정상 링크
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
