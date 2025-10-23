'use client'; // 반드시 있어야 페이지가 클라이언트로 동작합니다.

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import BootpayScript from '@/components/BootpayScript';
import { useUser } from '@/contexts/UserContext';

export default function SubscribePage() {
  const [showPopup, setShowPopup] = useState(false);
  const { user, role } = useUser();

  // 쿼리 파라미터 처리 (open=1일 때 팝업 자동 오픈)
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get('open') === '1') setShowPopup(true);
  }, [searchParams]);

  const plans = [
    { name: '무료', price: 0, key: 'free', description: '기본 변환 (한번에 1개씩 가능)' },
    { name: 'Basic', price: 10000, key: 'basic', description: '파일 처리 개수 제한 없음(Max : 50)' },
    { name: 'Premium', price: 100000, key: 'premium', description: 'Validation, Report 제공' },
  ];

  const handleSelect = (plan: any) => {
    // Basic 사용자면 Premium만 결제 가능
    if (String(role).toLowerCase() === 'basic' && plan.key !== 'premium') return;
    try {
      if (!(window as any).Bootpay) {
        alert('결제 모듈이 아직 로드되지 않았습니다.');
        return;
      }
      // Bootpay 결제 호출(실제 로직 연결 필요)
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
        onClick={() => setShowPopup(true)}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
      >
        구독하기
      </button>

      {showPopup && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
          onClick={() => setShowPopup(false)}
        >
          <div
            className="bg-white text-slate-900 dark:bg-gray-900 dark:text-white p-6 rounded-lg shadow-xl w-[95%] max-w-5xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowPopup(false)}
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xl"
            >
              &times;
            </button>

            <h2 className="text-xl font-semibold mb-6">요금제 선택</h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {plans.map((plan) => {
                const disabled =
                  String(role).toLowerCase() === 'basic' && plan.key !== 'premium';
                return (
                  <div
                    key={plan.key}
                    onClick={() => !disabled && handleSelect(plan)}
                    className={`border rounded-lg p-4 cursor-pointer transition h-full flex flex-col justify-between ${
                      plan.key === role ? 'border-blue-500' : 'border-gray-300'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow'}`}
                  >
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <div className="text-lg font-medium">
                          {plan.name}
                          {plan.key === role && (
                            <span className="ml-2 text-blue-500 text-sm">(현재 구독)</span>
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
    </main>
  );
}
