'use client';

import { useSubscribePopup } from '@/contexts/SubscribePopupContext';
import { useUser } from '@/contexts/UserContext';

const plans = [
  { name: '무료', price: 0, key: 'free', description: '기본 변환 (한번에 1개씩 가능)' },
  { name: 'Basic', price: 10000, key: 'basic', description: '파일 처리 개수 제한 없음(Max : 50)' },
  { name: 'Premium', price: 100000, key: 'premium', description: 'Validation, Report 제공' },
];

export default function SubscribePopup() {
  console.log('🟢 [SubscribePopup] 컴포넌트 렌더됨');

  const { show, close } = useSubscribePopup();
  const { user, role } = useUser();

  if (!show) {
    console.log('⚠️ [SubscribePopup] 팝업 show 상태가 false');
    return null;
  }

  // 💳 Bootpay 결제 요청 함수
  const requestPayment = (plan: any) => {
    if (typeof window === 'undefined') return;

    // ✅ Bootpay 로딩될 때까지 대기 (최대 10회 시도)
    let retryCount = 0;
    const maxRetries = 10;

    const tryBootpay = () => {
      if (!window.Bootpay) {
        retryCount++;
        console.warn(`⏳ [SubscribePopup] Bootpay 객체 대기 중... (${retryCount}/${maxRetries})`);
        if (retryCount < maxRetries) {
          setTimeout(tryBootpay, 200); // 0.2초 후 재시도
        } else {
          alert('Bootpay 로딩이 지연되고 있습니다. 새로고침 후 다시 시도해주세요.');
        }
        return;
      }

      // ✅ Bootpay 사용 가능 시 실행
      const userInfo = {
        id: user?.uid || 'guest',
        username: user?.displayName || '비회원',
        email: user?.email || 'guest@example.com',
      };

      console.log('🟢 [SubscribePopup] 결제 요청 진입', { plan, userInfo });

      window.Bootpay.request({
        application_id: '5b8f6a4d396fa665fdc2b5e8', // ✅ 실제 Bootpay 앱 ID로 교체
        price: plan.price,
        name: plan.name,
        pg: 'kcp',
        method: 'card',
        order_id: `order_${Date.now()}`,
        user_info: userInfo,
        items: [
          {
            item_name: plan.name,
            qty: 1,
            unique: plan.key,
            price: plan.price,
          },
        ],
        extra: {
          open_type: 'iframe',
        },
        success: function (data: any) {
          console.log('✅ 결제 성공', data);
          alert('✅ 결제 성공\n' + JSON.stringify(data));
          close();
        },
        error: function (data: any) {
          console.error('❌ 결제 실패', data);
          alert('❌ 결제 실패\n' + JSON.stringify(data));
        },
        close: function () {
          console.log('🛑 결제창 닫힘');
        },
      });
    };

    // ▶ 최초 실행
    tryBootpay();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
      onClick={close}
    >
      <div
        className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-xl w-[95%] max-w-5xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 닫기 버튼 */}
        <button
          onClick={close}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl"
        >
          &times;
        </button>

        <h2 className="text-xl font-semibold mb-6">요금제 선택</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = plan.key === role;
            const isAdmin = role === 'admin';

            return (
              <div
                key={plan.key}
                className={`rounded-lg p-4 h-full flex flex-col justify-between transition ${
                  isCurrent || isAdmin
                    ? 'border-4 border-blue-500 bg-blue-50 dark:bg-blue-900 cursor-not-allowed'
                    : 'border border-gray-300 cursor-pointer hover:shadow'
                }`}
                onClick={() => {
                  if (!isCurrent && !isAdmin) {
                    console.log('🟢 [SubscribePopup] 요금제 클릭됨:', plan);
                    requestPayment(plan);
                  }
                }}
              >
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-lg font-medium">
                      {plan.name}
                      {(isCurrent || isAdmin) && (
                        <span className="ml-2 text-blue-500 text-sm">
                          {isAdmin ? '관리자 상태로 결제 비활성화' : '현재 상태'}
                        </span>
                      )}
                    </div>
                    <div className="text-right text-gray-600">
                      {plan.price === 0 ? '무료' : plan.price.toLocaleString() + '원'}
                    </div>
                  </div>
                  <p className="text-sm text-gray-500">{plan.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
