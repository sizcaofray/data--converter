'use client';
/**
 * app/(contents)/subscribe/page.tsx
 * ------------------------------------------------------------------
 * ✅ 요구사항
 *  1) 헤더에서 /subscribe?open=1 로 진입하면 페이지 로드시 결제 팝업 자동 오픈
 *  2) role==='basic' 인 기간 중에는 "무료/Basic" 비활성화, Premium만 선택 가능
 *  3) 기존 UI/마크업/Bootpay 연동은 유지(결제 호출 지점은 TODO 주석)
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import BootpayScript from '@/components/BootpayScript';
import { useUser } from '@/contexts/UserContext';

type PlanKey = 'free' | 'basic' | 'premium';

const PLANS: { name: string; price: number; key: PlanKey; description: string }[] = [
  { name: '무료',    price: 0,      key: 'free',    description: '기본 변환 (한번에 1개씩 가능)' },
  { name: 'Basic',   price: 10000,  key: 'basic',   description: '파일 처리 개수 제한 없음(Max : 50)' },
  { name: 'Premium', price: 100000, key: 'premium', description: 'Validation, Report 제공' },
];

export default function SubscribePage() {
  const { role } = useUser(); // 'free' | 'basic' | 'premium' | 'admin'
  const sp = useSearchParams();

  /** 팝업 표시 여부(기존 UI 흐름 유지) */
  const [showPopup, setShowPopup] = useState(false);

  /** 헤더에서 /subscribe?open=1 로 진입한 경우 자동으로 팝업 오픈 */
  useEffect(() => {
    if (sp.get('open') === '1') setShowPopup(true);
  }, [sp]);

  /** Basic 구독 중이면 무료/Basic 비활성화 */
  const disableKeys = useMemo<PlanKey[]>(() => {
    if (String(role).toLowerCase() === 'basic') return ['free', 'basic'];
    return [];
  }, [role]);

  /** 결제 요청(연결 지점은 기존 Bootpay 로직에 맞춰 그대로 사용) */
  const requestPayment = (plan: typeof PLANS[number]) => {
    // Basic 기간 중 무료/Basic은 차단
    if (disableKeys.includes(plan.key)) return;

    try {
      // Bootpay 로딩 여부 체크(HTTPS 환경 권장: Vercel production)
      if (!(window as any).Bootpay) {
        alert('결제 모듈 로딩 중입니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      // TODO: 기존 프로젝트의 Bootpay 요청 함수에 plan 정보를 연결하세요.
      // 예) window.Bootpay.request({ price: plan.price, ... })
      alert(`선택한 플랜: ${plan.name} (${plan.price.toLocaleString()}원)`);
      setShowPopup(false);
    } catch (e) {
      console.error(e);
      alert('결제 요청 중 오류가 발생했습니다.');
    }
  };

  return (
    <main className="p-6">
      <BootpayScript />

      <h1 className="text-2xl font-bold mb-6">구독 / 결제</h1>

      {/* Basic 이용 중 안내(기존 스타일 기반) */}
      {String(role).toLowerCase() === 'basic' && (
        <div className="mb-4 rounded-lg border border-amber-400 bg-amber-50 text-amber-800 px-4 py-3">
          Basic 구독 중입니다. <b>업그레이드는 Premium만 선택</b> 가능합니다.
        </div>
      )}

      {/* 요금제 카드 리스트(기존 마크업 유지, disable만 추가) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const disabled = disableKeys.includes(plan.key);
          const isCurrent = String(role).toLowerCase() === plan.key;

          return (
            <button
              key={plan.key}
              type="button"
              onClick={() => requestPayment(plan)}
              disabled={disabled}
              aria-disabled={disabled}
              className={[
                'h-full text-left border rounded-lg p-4 transition flex flex-col justify-between',
                isCurrent ? 'border-blue-500' : 'border-gray-300',
                disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow cursor-pointer',
              ].join(' ')}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-lg font-medium">
                    {plan.name}
                    {isCurrent && <span className="ml-2 text-blue-600 text-sm">(현재 구독)</span>}
                    {disabled && <span className="ml-2 text-amber-600 text-sm">Premium만 선택 가능</span>}
                  </div>
                  <div className="text-right text-gray-600 dark:text-gray-300">
                    {plan.price === 0 ? '무료' : `${plan.price.toLocaleString()}원`}
                  </div>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-300">{plan.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* 기존 팝업 UI가 이 페이지에 있다면 showPopup을 그대로 사용하세요.
         - 예: {showPopup && <SubscribePopup onClose={()=>setShowPopup(false)} .../>}
         - 현재 프로젝트 구조에서는 Bootpay 팝업을 직접 띄우므로 showPopup은 트리거 플래그 역할입니다.
      */}
    </main>
  );
}
