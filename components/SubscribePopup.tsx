'use client';

import { memo, useCallback, useMemo } from 'react';
import { useSubscribePopup } from '@/contexts/SubscribePopupContext';
import { useUser } from '@/contexts/UserContext';

const PLANS = [
  { name: '무료',    price: 0,      key: 'free',    description: '기본 변환 (한번에 1개씩 가능)' },
  { name: 'Basic',   price: 10000,  key: 'basic',   description: '파일 처리 개수 제한 없음(Max : 50)' },
  { name: 'Premium', price: 100000, key: 'premium', description: 'Validation, Report 제공' },
];

const norm = (v: unknown) => (v ?? '').toString().trim().toLowerCase();

function SubscribePopup() {
  const { show, close } = useSubscribePopup();
  const { user, role } = useUser();

  // show=false면 완전히 렌더하지 않음 (DOM 없음)
  if (!show) return null;

  const normalizedRole = norm(role);
  const isAdmin = normalizedRole === 'admin';
  const isBasicRole = normalizedRole === 'basic'; // ★ 추가: Basic 여부

  // Bootpay 준비 대기(안전)
  const waitBootpay = useCallback(async (retries = 10, intervalMs = 200) => {
    for (let i = 0; i < retries; i++) {
      if (typeof window !== 'undefined' && (window as any).Bootpay) return (window as any).Bootpay;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return null;
  }, []);

  const requestPayment = useCallback(
    async (plan: { name: string; price: number; key: string }) => {
      if (typeof window === 'undefined') return;

      const Bootpay = await waitBootpay();
      if (!Bootpay) {
        alert('Bootpay 로딩이 지연되고 있습니다. 새로고침 후 다시 시도해 주세요.');
        return;
      }

      const userInfo = {
        id: user?.uid || 'guest',
        username: user?.displayName || '비회원',
        email: user?.email || 'guest@example.com',
      };

      (window as any).Bootpay.request({
        application_id: '5b8f6a4d396fa665fdc2b5e8', // 실제 앱 ID
        price: plan.price,
        name: plan.name,
        pg: 'kcp',
        method: 'card',
        order_id: `order_${Date.now()}`,
        user_info: userInfo,
        items: [{ item_name: plan.name, qty: 1, unique: plan.key, price: plan.price }],
        extra: { open_type: 'iframe' },
        success() {
          alert('✅ 결제 성공');
          close();
        },
        error() {
          alert('❌ 결제 실패. 잠시 후 다시 시도해 주세요.');
        },
        close() {
          /* no-op */
        },
      });
    },
    [close, user, waitBootpay]
  );

  const cards = useMemo(
    () =>
      PLANS.map((plan) => {
        const isCurrent = plan.key === normalizedRole;
        // ★ 변경 포인트: Basic 사용자는 Basic 카드 비활성화 → Premium만 선택 가능
        const disabled = isAdmin || isCurrent || (isBasicRole && plan.key === 'basic');

        return (
          <div
            key={plan.key}
            className={[
              'rounded-lg p-4 h-full flex flex-col justify-between transition',
              disabled
                ? 'border-4 border-blue-500 bg-blue-50 dark:bg-blue-900 cursor-not-allowed'
                : 'border border-gray-300 cursor-pointer hover:shadow',
            ].join(' ')}
            onClick={() => {
              if (!disabled) requestPayment(plan);
            }}
            role="button"
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : 0}
          >
            <div>
              <div className="flex justify-between items-center mb-2">
                <div className="text-lg font-medium">
                  {plan.name}
                  {disabled && (
                    <span className="ml-2 text-blue-500 text-sm">
                      {isAdmin
                        ? '관리자 상태로 결제 비활성화'
                        : isBasicRole && plan.key === 'basic'
                        ? '업그레이드는 Premium만 선택'
                        : '현재 상태'}
                    </span>
                  )}
                </div>
                {/* ✅ 가격: 다크에서 가독성 향상 */}
                <div className="text-right text-gray-600 dark:text-gray-300">
                  {plan.price === 0 ? '무료' : plan.price.toLocaleString() + '원'}
                </div>
              </div>
              {/* ✅ 설명: 다크에서 가독성 향상 */}
              <p className="text-sm text-gray-500 dark:text-gray-300">{plan.description}</p>
            </div>
          </div>
        );
      }),
    [normalizedRole, isAdmin, isBasicRole, requestPayment]
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 grid place-items-center" onClick={close}>
      <div
        /* ✅ 카드 배경/텍스트 가독성 보장 */
        className="bg-white text-slate-900 dark:bg-gray-900 dark:text-white p-6 rounded-lg shadow-xl w-[95%] max-w-5xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xl"
          aria-label="닫기"
        >
          &times;
        </button>

        <h2 className="text-xl font-semibold mb-6">요금제 선택</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">{cards}</div>
      </div>
    </div>
  );
}

export default memo(SubscribePopup);
