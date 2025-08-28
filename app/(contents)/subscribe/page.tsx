// 📄 app/(contents)/subscribe/page.tsx
'use client';

import React, { useState } from 'react';
import BootpayScript from '@/components/BootpayScript';
import { useUser } from '@/contexts/UserContext';

export default function SubscribePage() {
  const [showPopup, setShowPopup] = useState(false);
  const { user, role } = useUser(); // 현재 사용자 정보 및 역할

  const plans = [
    { name: '무료', price: 0, key: 'free', description: '기본 변환 (한번에 1개씩 가능)' },
    { name: 'Basic', price: 10000, key: 'basic', description: '파일 처리 개수 제한 없음(Max : 50)' },
    { name: 'Premium', price: 100000, key: 'premium', description: 'Validation, Report 제공' },
  ];

  const openPopup = () => {
    setShowPopup(true);
  };

  const closePopup = () => {
    setShowPopup(false);
  };

  const requestPayment = (plan: any) => {
    alert(`${plan.name} 결제를 진행합니다.`);
    setShowPopup(false);
  };

  return (
    <main className="relative p-10">
      <BootpayScript />

      <h1 className="text-2xl font-bold mb-4">💳 구독 및 결제</h1>
      <p className="text-gray-600 mb-6">프리미엄 기능을 사용하시려면 구독 결제를 진행해주세요.</p>

      <button
        onClick={openPopup}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
      >
        구독하기
      </button>

      {/* 팝업 오버레이 */}
      {showPopup && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
          onClick={closePopup}
        >
          {/* 팝업 카드 */}
          <div
            className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-xl w-[95%] max-w-5xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 닫기 버튼 */}
            <button
              onClick={closePopup}
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl"
            >
              &times;
            </button>

            <h2 className="text-xl font-semibold mb-6">요금제 선택</h2>

            {/* 요금제 세로 → 가로 정렬 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <div
                  key={plan.key}
                  className={`border rounded-lg p-4 cursor-pointer transition h-full flex flex-col justify-between ${
    plan.key === role ? 'border-blue-500' : 'border-gray-300'
  }`}
                  onClick={() => requestPayment(plan)}
                >
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <div className="text-lg font-medium">
                        {plan.name}
                        {plan.key === role && (
                          <span className="ml-2 text-blue-500 text-sm">(현재결재상태)</span>
                        )}
                      </div>
                      <div className="text-right text-gray-600">
                        {plan.price === 0 ? '무료' : plan.price.toLocaleString() + '원'}
                      </div>
                    </div>
                    <p className="text-sm text-gray-500">
                      {plan.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
