// components/SubscribePopup.tsx
'use client';

/**
 * 구독 팝업
 * - "버튼 활성/비활성" 로직만 구현(결제 연동은 나중 단계)
 * - 디자인/마크업 변경 최소화
 *
 * 비활성 규칙(요구사항):
 * 1) admin → 모든 플랜 비활성화
 * 2) admin이 아니고 구독 아님(free) → 무료만 비활성화 (유료만 선택 가능)
 * 3) basic 구독자 → 무료, basic 비활성화 (premium만 가능)
 * 4) premium 구독자 → 모두 비활성화
 */

import React, { useMemo } from 'react';
import { useSubscribePopup } from '@/contexts/SubscribePopupContext';

// (선택) 유저 컨텍스트가 있는 프로젝트 구조일 경우 안전하게 참조
// 컨텍스트가 없다면 컴파일 오류가 나지 않도록 try/catch import 패턴을 지양하고,
// 아래에서 null-safe 가드로 기본값 처리합니다.
import { useUser } from '@/contexts/UserContext';

type Tier = 'admin' | 'premium' | 'basic' | 'free';

type PlanKey = 'free' | 'basic' | 'premium';
interface Plan {
  key: PlanKey;
  name: string;
  priceLabel: string; // 결제 모듈 연동 전이므로 표시용 라벨만 유지
  description?: string;
}

const PLANS: Plan[] = [
  { key: 'free',    name: '무료',    priceLabel: '무료',           description: '기본 기능' },
  { key: 'basic',   name: 'Basic',   priceLabel: '10,000원',       description: '일반 구독' },
  { key: 'premium', name: 'Premium', priceLabel: '100,000원',      description: '고급 구독' },
];

export default function SubscribePopup() {
  const { isOpen, close } = useSubscribePopup();
  const { user, profile } = useUser?.() || ({} as any);

  /**
   * 프로젝트별 유저 정보 구조가 다를 수 있으므로,
   * 가능한 여러 케이스를 안전하게 해석하여 tier를 결정합니다.
   *
   * 우선순위 예시:
   * - profile?.role === 'admin' 또는 user?.claims?.admin → 'admin'
   * - profile?.role === 'premium' 또는 profile?.plan === 'premium' → 'premium'
   * - profile?.role === 'basic'   또는 profile?.plan === 'basic'   → 'basic'
   * - 그 외 → 'free'
   */
  const tier: Tier = useMemo<Tier>(() => {
    // 관리자 판정
    const isAdmin =
      (profile && (profile.role === 'admin' || profile.isAdmin === true)) ||
      (user && user.claims && user.claims.admin === true);
    if (isAdmin) return 'admin';

    // 프리미엄 판정
    const isPremium =
      (profile && (profile.role === 'premium' || profile.plan === 'premium' || profile.isPremium === true));
    if (isPremium) return 'premium';

    // 베이직 판정
    const isBasic =
      (profile && (profile.role === 'basic' || profile.plan === 'basic' || profile.isBasic === true));
    if (isBasic) return 'basic';

    // 기본값: 미구독
    return 'free';
  }, [user, profile]);

  /**
   * 비활성화 규칙 구현
   */
  const isDisabled = (planKey: PlanKey): boolean => {
    switch (tier) {
      case 'admin':
        // 1) admin → 모두 비활성화
        return true;
      case 'free':
        // 2) admin이 아니고 구독 아님 → 무료만 비활성화
        return planKey === 'free';
      case 'basic':
        // 3) basic 구독자 → 무료, basic 비활성화
        return planKey === 'free' || planKey === 'basic';
      case 'premium':
        // 4) premium 구독자 → 모두 비활성화
        return true;
      default:
        return true;
    }
  };

  /**
   * 버튼 클릭(결제 연동은 추후)
   * - 현재 단계에서는 동작하지 않도록 막거나, 안내만 표시
   */
  const handleSelect = (plan: Plan) => {
    if (isDisabled(plan.key)) return;
    // 결제 연동은 프로젝트 마지막 단계에서 붙일 예정이므로 현재는 안내만
    alert(`${plan.name} 선택 (결제 연동은 개발 완료 시 적용됩니다)`);
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

        {/* 푸터(선택): 현재 사용자 티어 표시로 디버깅 도움 */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300">
          현재 상태: <span className="font-mono">{tier}</span>
        </div>
      </div>
    </div>
  );
}
  