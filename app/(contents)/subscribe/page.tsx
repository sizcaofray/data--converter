'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import BootpayScript from '@/components/BootpayScript';
import { useUser } from '@/contexts/UserContext';

// 🔧 타입 정의 (핵심)
type PlanKey = 'free' | 'basic' | 'premium';
interface Plan {
  name: string;
  price: number;
  key: PlanKey;
  description: string;
}

export default function SubscribePage() {
  const [showPopup, setShowPopup] = useState(false);
  const { role } = useUser();

  const sp = useSearchParams();
  const debugOn = sp?.get('debug') === '1';
  const openQS = sp?.get('open') === '1';
  const upgradeQS = sp?.get('upgrade') === 'premium';
  const roleNorm = String(role).toLowerCase() as PlanKey | 'admin';
  const dbg = (...args: any[]) => console.debug('[SubscribePage]', ...args);

  // /subscribe?open=1 → 자동 팝업 오픈
  useEffect(() => {
    if (openQS) { setShowPopup(true); if (debugOn) dbg('AUTO OPEN POPUP via ?open=1'); }
  }, [openQS, debugOn]);

  // 마운트 로그
  useEffect(() => {
    if (!debugOn) return;
    dbg('MOUNT', { role: roleNorm, openQS, upgradeQS, bootpayPresent: !!(window as any).Bootpay });
    window.onerror = (msg, src, line, col, err) => { dbg('window.onerror', { msg, src, line, col, err }); return false; };
    window.onunhandledrejection = (e) => { dbg('unhandledrejection', e?.reason || e); };
  }, [debugOn, roleNorm, openQS, upgradeQS]);

  // ⬇⬇⬇ 여기에서 Plan 타입으로 정확히 고정 (key가 'free' | 'basic' | 'premium' 으로 추론됨)
  const plans: ReadonlyArray<Plan> = useMemo(
    () => [
      { name: '무료',    price: 0,      key: 'free',    description: '기본 변환 (한번에 1개씩 가능)' },
      { name: 'Basic',   price: 10000,  key: 'basic',   description: '파일 처리 개수 제한 없음(Max : 50)' },
      { name: 'Premium', price: 100000, key: 'premium', description: 'Validation, Report 제공' },
    ],
    [],
  );

  // Basic 사용자는 Premium만 가능
  const disabled = (key: PlanKey): boolean =>
    roleNorm === 'basic' && key !== 'premium';

  const handleSelect = (plan: Plan) => {
    if (disabled(plan.key)) { if (debugOn) dbg('CLICK disabled plan', plan.key); return; }
    try {
      if (!(window as any).Bootpay) {
        if (debugOn) dbg('Bootpay not loaded');
        alert('결제 모듈이 아직 로드되지 않았습니다. (HTTPS 권장)');
        return;
      }
      if (debugOn) dbg('REQUEST PAY', { plan });
      // TODO: 실제 Bootpay 연동 함수 호출
      alert(`${plan.name} 결제를 진행합니다.`);
      setShowPopup(false);
    } catch (e) {
      console.error(e);
      alert('결제 중 오류가 발생했습니다.');
    }
  };

  return (
    <main className="relative p-10">
      <BootpayScript />
      <h1 className="text-2xl font-bold mb-6">구독 / 결제</h1>

      <p className="text-gray-600 dark:text-gray-300 mb-4">
        원하는 플랜을 선택해 결제를 진행하세요.
      </p>

      <button
        onClick={() => { setShowPopup(true); if (debugOn) dbg('OPEN POPUP (button)'); }}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
      >
        구독하기
      </button>

      {showPopup && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
          onClick={() => { setShowPopup(false); if (debugOn) dbg('CLOSE POPUP (overlay)'); }}
        >
          <div
            className="bg-white text-slate-900 dark:bg-gray-900 dark:text-white p-6 rounded-lg shadow-xl w-[95%] max-w-5xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setShowPopup(false); if (debugOn) dbg('CLOSE POPUP (x)'); }}
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xl"
              aria-label="닫기"
            >
              &times;
            </button>

            <h2 className="text-xl font-semibold mb-6">요금제 선택</h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {plans.map((plan) => {
                const isDisabled = disabled(plan.key);
                const isCurrent = roleNorm === plan.key;
                return (
                  <div
                    key={plan.key}
                    onClick={() => !isDisabled && handleSelect(plan)}
                    className={`border rounded-lg p-4 cursor-pointer transition h-full flex flex-col justify-between ${
                      isCurrent ? 'border-blue-500' : 'border-gray-300'
                    } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow'}`}
                    aria-disabled={isDisabled}
                    title={isDisabled ? 'Basic 구독 중에는 Premium만 선택 가능합니다.' : undefined}
                  >
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <div className="text-lg font-medium">
                          {plan.name}
                          {isCurrent && (
                            <span className="ml-2 text-blue-500 text-sm">(현재 구독)</span>
                          )}
                          {upgradeQS && plan.key === 'premium' && (
                            <span className="ml-2 text-amber-600 text-sm">업그레이드 대상</span>
                          )}
                        </div>
                        <div className="text-right text-gray-600 dark:text-gray-300">
                          {plan.price === 0 ? '무료' : `${plan.price.toLocaleString()}원`}
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-300">
                        {plan.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 디버그 오버레이: ?debug=1 일 때만 표시(레이아웃 영향 없음) */}
      {debugOn && (
        <div className="fixed bottom-2 right-2 z-[9999] text-[11px] bg-black/70 text-white px-2 py-1 rounded pointer-events-none">
          role:{roleNorm} · openQS:{String(openQS)} · upgradeQS:{String(upgradeQS)} · bootpay:{String(!!(window as any).Bootpay)}
        </div>
      )}
    </main>
  );
}
