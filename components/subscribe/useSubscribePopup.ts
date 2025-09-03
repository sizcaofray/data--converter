'use client';
/**
 * useSubscribePopup 훅 (프로덕션 안전 폴백)
 * - NODE_ENV === 'production' 일 때는 Provider 누락 시 throw하지 않고 no-op 객체를 반환
 * - 개발 환경에서는 기존처럼 에러 throw로 즉시 원인 파악
 */

import { useContext } from 'react';
import { SubscribePopupContext } from './SubscribePopupContext'; // 경로는 기존과 동일하게 유지

type PopupAPI = {
  show: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

export function useSubscribePopup(): PopupAPI {
  const ctx = useContext(SubscribePopupContext) as PopupAPI | null;

  if (!ctx) {
    if (process.env.NODE_ENV !== 'production') {
      // 개발 환경: 문제를 빨리 찾도록 그대로 에러
      throw new Error('useSubscribePopup must be used within SubscribePopupProvider');
    }
    // 프로덕션: no-op 폴백으로 빌드/렌더 중단 방지
    return {
      show: false,
      open: () => {},
      close: () => {},
      toggle: () => {},
    };
  }

  return ctx;
}
