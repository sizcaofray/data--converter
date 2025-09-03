'use client';
/**
 * useSubscribePopup 훅
 * - Provider 하위에서 팝업 제어 API를 제공
 * - 프로덕션에서는 Provider가 없더라도 throw하지 않고 no-op 폴백을 반환하여 빌드/렌더 중단 방지
 * - 개발환경(NODE_ENV !== 'production')에서는 기존처럼 throw하여 문제를 빨리 발견
 */

import { useContext } from 'react';
import { SubscribePopupContext, type PopupAPI } from './SubscribePopupContext';

export function useSubscribePopup(): PopupAPI {
  const ctx = useContext(SubscribePopupContext);

  if (!ctx) {
    // 개발 환경: 명확히 에러를 던져 원인을 빨리 찾도록 유지
    if (process.env.NODE_ENV !== 'production') {
      throw new Error('useSubscribePopup must be used within SubscribePopupProvider');
    }
    // 프로덕션(SSG/SSR 포함): 안전 폴백 → 앱이 죽지 않도록 no-op 객체 반환
    return {
      show: false,
      open: () => {},
      close: () => {},
      toggle: () => {},
    };
  }

  return ctx;
}

/** default/named 둘 다 export → 기존 임포트 방식 호환성 보장 */
export default useSubscribePopup;
