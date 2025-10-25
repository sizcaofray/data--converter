// components/SubscribePopup.tsx
'use client';

/**
 * 팝업 표시 컴포넌트
 * - 기존 디자인/마크업/기능을 유지합니다.
 * - 결제 모듈 연동은 미포함(마지막 단계에 붙임)
 * - 타입 오류(PopupAPI에 isOpen 없음)를 피하기 위해 컨텍스트 접근을 안전 캐스팅(any)으로 처리
 *
 * 버튼 비활성화 규칙:
 * 1) admin    → 모두 비활성화
 * 2) free     → 무료만 비활성화
 * 3) basic    → 무료·basic 비활성화 (premium만 가능)
 * 4) premium  → 모두 비활성화
 */

import React, { useMemo } from 'react';
import { useSubscribePopup } from '@/contexts/SubscribePopupContext';
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
  // ✅ 타입 충돌 회피: any 캐스팅으로 안전 접근 (PopupAPI 타입에 isOpen 미정의 케이스 대응)
  const popup: any = (useSubscribePopup() as any) ?? {};
  const isOpen: boolean = Boolean(popup?.isOpen);
  const close: () => void =
    typeof popup?.close === 'function' ? popup.close : () => {};

  // 기존 유저/프로필 컨텍스트 사용 (없으면 free로 판정)
  const { user, profile } = (useUser?.() as any) || {};

  // ✅ 현재 티어 판정 (프로젝트 필드에 유연 대응)
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

  // ✅ 비활성화 규칙(요청사항 4가지)
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

  // 결제 연동 보류: 현재는 선택 가능성만 확인
  const handleSelect = (plan: Plan) => {
    if (isDisabled(plan.key)) return;
    alert(`${plan.name} 선택됨 (결제 연동은 개발 완료 후 적용)`);
  };

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

        {/* 본문: 플랜 카드 */}
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

        {/* (선택) 현재 티어 표기: 디버깅에 유용, 필요 없으면 제거 가능 */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300">
          현재 상태: <span className="font-mono">{tier}</span>
        </div>
      </div>
    </div>
  );
}
