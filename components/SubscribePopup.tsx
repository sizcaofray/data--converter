// components/SubscribePopup.tsx
'use client';

/**
 * [개요]
 * - "구독 팝업" 컴포넌트의 전체 코드입니다.
 * - 결제 모듈 연동은 마지막 단계에 진행할 예정이므로, 여기서는 버튼 활성/비활성 규칙만 적용합니다.
 * - 기존 디자인/마크업 흐름을 유지하면서, 타입/컨텍스트 유무에 대한 안전 가드만 추가했습니다.
 *
 * [버튼 비활성화 규칙(요청사항 4가지)]
 * 1) admin    → 모든 플랜 비활성화
 * 2) free     → "무료"만 비활성화 (유료만 선택 가능)
 * 3) basic    → "무료"와 "Basic" 비활성화 (Premium만 선택 가능)
 * 4) premium  → 모든 플랜 비활성화
 *
 * [주의]
 * - 레이아웃/헤더/다른 파일은 절대 수정하지 않습니다.
 * - 컨텍스트 타입이 프로젝트마다 다를 수 있어, 안전하게(any 캐스트) 접근합니다.
 * - 결제 요청 함수(requestPayment)는 현재는 알림만 띄우도록 구성(실제 결제 연동은 추후)
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';

// --- 구독 팝업 컨텍스트 안전 접근(프로젝트에 따라 타입/필드가 다를 수 있음)
let useSubscribePopupSafe: undefined | (() => any);
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useSubscribePopupSafe = require('@/contexts/SubscribePopupContext').useSubscribePopup as () => any;
} catch (_) {
  useSubscribePopupSafe = undefined;
}

// --- 유저 컨텍스트 안전 접근(없어도 동작)
let useUserSafe: undefined | (() => any);
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useUserSafe = require('@/contexts/UserContext').useUser as () => any;
} catch (_) {
  useUserSafe = undefined;
}

// ───────────────────────────────────────────────────────────────────────────────
// 타입/상수
// ───────────────────────────────────────────────────────────────────────────────

type Tier = 'admin' | 'premium' | 'basic' | 'free';

type PlanKey = 'free' | 'basic' | 'premium';
interface Plan {
  key: PlanKey;
  name: string;
  priceLabel: string;        // 결제 미연동 상태라 표시용 라벨만 사용
  description?: string;
}

// 필요 시 기존 파일의 PLANS 정의와 동일하게 유지하세요.
const PLANS: Plan[] = [
  { key: 'free',    name: '무료',    priceLabel: '무료',       description: '기본 기능' },
  { key: 'basic',   name: 'Basic',   priceLabel: '10,000원',   description: '일반 구독' },
  { key: 'premium', name: 'Premium', priceLabel: '100,000원',  description: '고급 구독' },
];

// ───────────────────────────────────────────────────────────────────────────────
// 유틸: 버튼 비활성화 규칙
// ───────────────────────────────────────────────────────────────────────────────

/**
 * 버튼 비활성화 규칙 (요구사항 4가지 그대로)
 */
function isPlanDisabledByTier(tier: Tier, planKey: PlanKey): boolean {
  switch (tier) {
    case 'admin':
      // 1) admin → 모두 비활성화
      return true;
    case 'free':
      // 2) free → 무료만 비활성화
      return planKey === 'free';
    case 'basic':
      // 3) basic → 무료, basic 비활성화 (premium만 가능)
      return planKey === 'free' || planKey === 'basic';
    case 'premium':
      // 4) premium → 모두 비활성화
      return true;
    default:
      return true;
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// 컴포넌트
// ───────────────────────────────────────────────────────────────────────────────

export default function SubscribePopup() {
  // 1) 팝업 컨텍스트(있으면 사용, 없으면 폴백)
  const popupCtx: any = useSubscribePopupSafe ? useSubscribePopupSafe() : null;

  // 컨텍스트가 isOpen/close를 제공하지 않을 가능성을 고려
  const ctxHasIsOpen = !!(popupCtx && typeof popupCtx.isOpen === 'boolean');
  const ctxHasClose  = !!(popupCtx && typeof popupCtx.close  === 'function');

  // 폴백: 전역 이벤트로 여닫기 (layout/다른 파일 수정 없이도 동작하도록 하기 위함)
  const [fallbackOpen, setFallbackOpen] = useState(false);

  // 표시 여부: 컨텍스트 isOpen 우선, 없으면 폴백 상태 사용
  const isOpen: boolean = ctxHasIsOpen ? popupCtx.isOpen : fallbackOpen;
  const close: () => void = ctxHasClose ? popupCtx.close : () => setFallbackOpen(false);

  // 이벤트 리스너는 컨텍스트가 없을 때만 등록
  useEffect(() => {
    if (ctxHasIsOpen) return;
    const onOpen = () => setFallbackOpen(true);
    const onClose = () => setFallbackOpen(false);
    window.addEventListener('open-subscribe-popup', onOpen as EventListener);
    window.addEventListener('close-subscribe-popup', onClose as EventListener);
    return () => {
      window.removeEventListener('open-subscribe-popup', onOpen as EventListener);
      window.removeEventListener('close-subscribe-popup', onClose as EventListener);
    };
  }, [ctxHasIsOpen]);

  // 2) 사용자/프로필 가져오기(없으면 free 처리)
  const userCtx: any = useUserSafe ? useUserSafe() : {};
  const user = userCtx?.user ?? null;
  const profile = userCtx?.profile ?? null;

  /**
   * 현재 티어 판정
   * - 프로젝트별 실제 보유 필드에 맞춰 넓게 판정(안전)
   * - admin > premium > basic > free
   */
  const tier: Tier = useMemo<Tier>(() => {
    const isAdmin =
      (profile && (profile.role === 'admin' || profile.isAdmin === true)) ||
      (user && user.claims && user.claims.admin === true);
    if (isAdmin) return 'admin';

    const isPremium =
      profile && (profile.role === 'premium' || profile.plan === 'premium' || profile.isPremium === true);
    if (isPremium) return 'premium';

    const isBasic =
      profile && (profile.role === 'basic' || profile.plan === 'basic' || profile.isBasic === true);
    if (isBasic) return 'basic';

    return 'free';
  }, [user, profile]);

  // 3) 플랜 카드 렌더링 데이터
  const cards = useMemo(
    () =>
      PLANS.map((plan) => {
        const disabled = isPlanDisabledByTier(tier, plan.key);
        return { ...plan, disabled };
      }),
    [tier],
  );

  // 4) 선택 핸들러(결제 연동은 최종 단계에서)
  const handleSelect = useCallback((plan: Plan) => {
    if (isPlanDisabledByTier(tier, plan.key)) return;
    // 현재 단계: 결제 모듈 연동 안 함. 선택 가능 상태만 검증.
    alert(`${plan.name} 선택됨 (결제 연동은 개발 완료 후 적용)`);
  }, [tier]);

  // 팝업 닫기 핸들러
  const handleClose = useCallback(() => close(), [close]);

  // 표시 조건
  if (!isOpen) return null;

  // ───────────────────────────────────────────────────────────────────────────
  // 마크업: 기존 구조를 해치지 않는 범위에서만 작성
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="구독 결제 팝업"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl">
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold">요금제 선택</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-sm px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
          >
            닫기
          </button>
        </div>

        {/* 본문: 플랜 카드 리스트 */}
        <div className="p-5 grid grid-cols-1 gap-4">
          {cards.map((p) => (
            <div key={p.key} className="border rounded-xl p-4 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">{p.name}</div>
                <div className="text-sm opacity-75">{p.priceLabel}</div>
              </div>

              {p.description && (
                <p className="text-sm text-gray-500 dark:text-gray-300 mb-3">{p.description}</p>
              )}

              <button
                type="button"
                disabled={p.disabled}
                onClick={() => handleSelect(p)}
                className="w-full rounded-lg border px-4 py-2 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
              >
                {p.disabled ? '선택 불가' : '선택'}
              </button>
            </div>
          ))}
        </div>

        {/* 푸터(선택): 현재 티어 표시(디버깅용) */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300">
          현재 상태: <span className="font-mono">{tier}</span>
        </div>
      </div>
    </div>
  );
}
