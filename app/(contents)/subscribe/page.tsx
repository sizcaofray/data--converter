'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import BootpayScript from '@/components/BootpayScript';
import { useUser } from '@/contexts/UserContext';

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

  // helper log function
  const log = (...msg: any[]) => {
    console.log('[Subscribe Debug]', ...msg);
  };

  // 쿼리로 open=1 들어오면 자동 팝업
  useEffect(() => {
    if (openQS) {
      log('자동 팝업 오픈 조건 충족 (open=1)');
      setShowPopup(true);
    }
  }, [openQS]);

  // BootpayScript 로드 상태 모니터링
  useEffect(() => {
    const timer = setInterval(() => {
      if ((window as any).Bootpay) {
        log('✅ Bootpay 객체 로드 확인 완료');
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const plans: Plan[] = useMemo(
    () => [
      { name: '무료', price: 0, key: 'free', description: '기본 변환 (한번에 1개씩 가능)' },
      { name: 'Basic', price: 10000, key: 'basic', description: '파일 처리 개수 제한 없음(Max : 50)' },
      { name: 'Premium', price: 100000, key: 'premium', description: 'Validation, Report 제공' },
    ],
    []
  );

  const disabled = (key: PlanKey) => roleNorm === 'basic' && key !== 'premium';

  const handleSelect = (plan: Plan) => {
    log('선택한 플랜:', plan.key);

    if (disabled(plan.key)) {
      log('⚠️ Basic 유저의 비활성화 플랜 클릭 차단');
      alert('Basic 사용자는 Premium만 결제 가능합니다.');
      return;
    }

    try {
      const bootpay = (window as any).Bootpay;
      if (!bootpay) {
        log('❌ Bootpay 객체 없음 — 로드되지 않음');
        alert('결제 모듈이 아직 로드되지 않았습니다. (HTTPS 환경 필요)');
        return;
      }

      log('✅ Bootpay 결제 요청 시작');
      alert(`${plan.name} 결제를 진행합니다.`);

      // 실제 Bootpay 호출 (시뮬레이션)
      // bootpay.request({ ... });

      setShowPopup(false);
      log('결제 팝업 닫힘');
    } catch (e) {
      console.error('❌ 결제 중 오류 발생', e);
      alert('결제 중 오류가 발생했습니다. 콘솔 로그를 확인하세요.');
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
        onClick={() => {
          setShowPopup(true);
          log('수동 구독 팝업 열기 클릭됨');
        }}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
      >
        구독하기
      </button>

      {showPopup && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
          onClick={() => {
            setShowPopup(false);
            log('팝업 영역 클릭 → 닫힘');
          }}
        >
          <div
            className="bg-white text-slate-900 dark:bg-gray-900 dark:text-white p-6 rounded-lg shadow-xl w-[95%] max-w-5xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setShowPopup(false);
                log('팝업 닫기 버튼 클릭');
              }}
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
                      <p className="text-sm text-gray-500 dark:text-gray-300">{plan.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
