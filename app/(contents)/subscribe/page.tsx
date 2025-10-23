// 📄 app/(contents)/subscribe/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import BootpayScript from '@/components/BootpayScript';
import { useUser } from '@/contexts/UserContext';

export default function SubscribePage() {
  const [showPopup, setShowPopup] = useState(false);
  const { user, role } = useUser(); // 현재 사용자 정보 및 역할

  // 헤더에서 /subscribe?open=1 로 이동했을 때 자동 오픈 (UI/클래스 변경 없음)
  const sp = useSearchParams();
  useEffect(() => {
    if (sp.get('open') === '1') setShowPopup(true);
  }, [sp]);

  const plans = [
    { name: '무료', price: 0, key: 'free', description: '기본 변환 (한번에 1개씩 가능)' },
    { name: 'Basic', price: 10000, key: 'basic', description: '파일 처리 개수 제한 없음(Max : 50)' },
    { name: 'Premium', price: 100000, key: 'premium', description: 'Validation, Report 제공' },
  ];

  const openPopup = () => setShowPopup(true);
  const closePopup = () => setShowPopup(false);

  const requestPayment = (plan: any) => {
    // role==='basic' 기간에는 무료/Basic 비활성화 (Premium만 허용)
    if (String(role).toLowerCase() === 'basic' && plan.key !== 'premium') return;
    // ⬇ Bootpay 연동부는 기존 로직에 연결하세요
    alert(`${plan.name} 결제를 진행합니다.`);
    setShowPopup(false);
  };

  return (
    <main className="relative p-10">
      <BootpayScript />
      <h1 className="text-2xl font-bold mb-6">구독 / 결제</h1>

      {/* 안내 영역(기존 스타일/정렬 유지) */}
      <p className="text-gray-600 dark:text-gray-300 mb-4">
        원하는 플랜을 선택해 결제를 진행하세요.
      </p>

      {/* 팝업 열기 버튼(기존) */}
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
            /* ✅ 카드 배경/텍스트: 라이트(흰 배경=진한 글자), 다크(어두운 배경=흰 글자) */
            className="bg-white text-slate-900 dark:bg-gray-900 dark:text-white p-6 rounded-lg shadow-xl w-[95%] max-w-5xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 닫기 버튼 */}
            <button
              onClick={closePopup}
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xl"
              aria-label="닫기"
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
                  onClick={() => { if (!(String(role).toLowerCase() === 'basic' && plan.key !== 'premium')) requestPayment(plan); }}
                  aria-disabled={String(role).toLowerCase() === 'basic' && plan.key !== 'premium'}
                  title={String(role).toLowerCase() === 'basic' && plan.key !== 'premium' ? 'Premium만 선택 가능합니다.' : undefined}
                >
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <div className="text-lg font-medium">
                        {plan.name}
                        {plan.key === role && (
                          <span className="ml-2 text-blue-500 text-sm">(현재결재상태)</span>
                        )}
                      </div>
                      <div className="text-right text-gray-600 dark:text-gray-300">
                        {plan.price === 0 ? '무료' : `${plan.price.toLocaleString()}원`}
                      </div>
                    </div>

                    {/* ✅ 설명 가독성 */}
                    <p className="text-sm text-gray-500 dark:text-gray-300">
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
