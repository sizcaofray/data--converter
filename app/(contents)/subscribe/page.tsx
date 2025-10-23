// 📄 app/(contents)/subscribe/page.tsx
'use client';

import React, { useMemo } from 'react';
import BootpayScript from '@/components/BootpayScript';
import { useUser } from '@/contexts/UserContext';
import { useSearchParams } from 'next/navigation';

type PlanKey = 'free' | 'basic' | 'premium';

const PLANS: { name: string; price: number; key: PlanKey; description: string }[] = [
  { name: '무료',    price: 0,      key: 'free',    description: '기본 변환 (한번에 1개씩 가능)' },
  { name: 'Basic',   price: 10000,  key: 'basic',   description: '파일 처리 개수 제한 없음(Max : 50)' },
  { name: 'Premium', price: 100000, key: 'premium', description: 'Validation, Report 제공' },
];

export default function SubscribePage() {
  const { role } = useUser(); // 'free' | 'basic' | 'premium' | 'admin'
  const sp = useSearchParams();
  const wantUpgrade = sp.get('upgrade') === 'premium'; // /subscribe?upgrade=premium

  // Basic 구독 중일 때: 무료/Basic은 비활성화(요구사항)
  const disableKeys = useMemo<PlanKey[]>(() => {
    if (role === 'basic') return ['free', 'basic'];
    // 나머지는 자유 선택(필요 시 추가 정책 가능)
    return [];
  }, [role]);

  const onSelect = (plan: typeof PLANS[number]) => {
    // Basic 상태에서 무료/Basic 클릭 → 무시
    if (disableKeys.includes(plan.key)) return;

    // 실제 결제창 호출(부트페이)
    // 여기서는 데모: plan.key/price를 전달하는 형태. 실제 request()는 프로젝트 기존 함수 연결.
    try {
      if (!(window as any).Bootpay) {
        alert('결제 모듈 로딩 중입니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      // TODO: 기존 결제 요청 함수로 연결하세요.
      // window.Bootpay.request({ ... });
      alert(`선택한 플랜: ${plan.name} (${plan.price.toLocaleString()}원)`);
    } catch (e) {
      console.error(e);
      alert('결제 요청 중 오류가 발생했습니다.');
    }
  };

  return (
    <main className="p-6">
      <BootpayScript />
      <h1 className="text-2xl font-bold mb-6">구독 / 결제</h1>

      {/* 업그레이드 유도 배너 */}
      {role === 'basic' && (
        <div className="mb-4 rounded-lg border border-amber-400 bg-amber-50 text-amber-800 px-4 py-3">
          Basic 구독 중입니다. <b>업그레이드는 Premium만 선택</b> 가능합니다.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const disabled = disableKeys.includes(plan.key);
          const isCurrent = plan.key === role;

          return (
            <button
              key={plan.key}
              type="button"
              onClick={() => onSelect(plan)}
              disabled={disabled}
              className={[
                'h-full text-left border rounded-lg p-4 transition flex flex-col justify-between',
                isCurrent ? 'border-blue-500' : 'border-gray-300',
                disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow',
              ].join(' ')}
              aria-disabled={disabled}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-lg font-medium">
                    {plan.name}
                    {isCurrent && <span className="ml-2 text-blue-600 text-sm">(현재 구독)</span>}
                  </div>
                  <div className="text-right text-gray-600 dark:text-gray-300">
                    {plan.price === 0 ? '무료' : `${plan.price.toLocaleString()}원`}
                  </div>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-300">{plan.description}</p>
              </div>

              {/* 업그레이드 모드로 들어온 경우(Premium 강조) */}
              {wantUpgrade && plan.key === 'premium' && (
                <div className="mt-3 text-xs text-amber-700">업그레이드 대상</div>
              )}
            </button>
          );
        })}
      </div>
    </main>
  );
}
