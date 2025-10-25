// components/SubscribePopup.tsx
'use client';

/**
 * 변경점 요약
 * - 컨텍스트 타입에 isOpen이 없어도 동작하도록 any 캐스팅으로 안전 접근
 * - isOpen 미제공 시 기본값 false 처리(표시 안 함)
 * - close 미제공 시 no-op 처리
 * - 결제 연동 보류, 버튼 활성/비활성 규칙만 반영
 *
 * 비활성 규칙:
 * 1) admin → 모두 비활성화
 * 2) free(미구독, admin 아님) → 무료만 비활성화
 * 3) basic → 무료·basic 비활성화
 * 4) premium → 모두 비활성화
 */

import React, { useMemo } from 'react';
import { useSubscribePopup } from '@/contexts/SubscribePopupContext';

// 프로젝트에 따라 없을 수도 있는 컨텍스트이므로 안전 접근
import { useUser } from '@/contexts/UserContext';

type Tier = 'admin' | 'premium' | 'basic' | 'free';

type PlanKey = 'free' | 'basic' | 'premium';
interface Plan {
  key: PlanKey;
  name: string;
  priceLabel: string;
  description?: string;
}

const PLANS: Plan[] = [
  { key: 'free',    name: '무료',    priceLabel: '무료',       description: '기본 기능' },
  { key: 'basic',   name: 'Basic',   priceLabel: '10,000원',   description: '일반 구독' },
  { key: 'premium', name: 'Premium', priceLabel: '100,000원',  description: '고급 구독' },
];

export default function SubscribePopup() {
  // 컨텍스트 타입 안전 처리(any 캐스팅)
  const popupCtx: any = useSubscribePopup?.() ?? {};
  const isOpen: boolean = Boolean(popupCtx?.isOpen); // 컨텍스트가 isOpen을 제공하지 않으면 false
  const close: () => void = typeof popupCtx?.close === 'function' ? popupCtx.close : () => {};

  // 사용자 정보도 안전 접근(없으면 free로 판정)
  const userCtx: any = useUser?.() ?? {};
  const user = userCtx?.user ?? null;
  const profile = userCtx?.profile ?? null;

  // 티어 판정(프로젝트 실데이터에 맞게 유연 판정)
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

  // 비활성화 규칙
  const isDisabled = (planKey: PlanKey): boolean => {
    switch (tier) {
      case 'admin':
        return true; // 1) admin → 모두 비활성화
      case 'free':
        return planKey === 'free'; // 2) free → 무료만 비활성화
      case 'basic':
        return planKey === 'free' || planKey === 'basic'; // 3) basic → 무료·basic 비활성화
      case 'premium':
        return true; // 4) premium → 모두 비활성화
      default:
        return true;
    }
  };

  const handleSelect = (plan: Plan) => {
    if (isDisabled(plan.key)) return;
    // 결제 연동은 최종 단계에서: 지금은 안내만
    alert(`${plan.name} 선택 (결제 연동은 개발 완료 시 적용됩니다)`);
  };

  // 컨텍스트가 표시상태를 제공하지 않으면, 팝업을 띄우지 않음
  if (!isOpen) return null;

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
            onClick={close}
            className="text-sm px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
          >
            닫기
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 grid grid-cols-1 gap-4">
          {PLANS.map((p) => {
            const disabled = isDisabled(p.key);
            return (
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
                  disabled={disabled}
                  onClick={() => handleSelect(p)}
                  className="w-full rounded-lg border px-4 py-2 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
                >
                  {disabled ? '선택 불가' : '선택'}
                </button>
              </div>
            );
          })}
        </div>

        {/* 푸터(디버그용 표시) */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300">
          현재 상태: <span className="font-mono">{tier}</span>
        </div>
      </div>
    </div>
  );
}
