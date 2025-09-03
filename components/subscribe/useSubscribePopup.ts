'use client';
/**
 * useSubscribePopup 훅 (빌드-안전 버전)
 * - Provider가 없으면 production/SSG/SSR에서도 절대 throw하지 않음
 * - 개발 중(NODE_ENV !== 'production')에는 경고만 출력
 */
import { useContext } from 'react';
import { SubscribePopupContext, type PopupAPI } from './SubscribePopupContext';

const FALLBACK: PopupAPI = {
  show: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
};

/** 단일 구현을 default/named로 함께 export → 모든 임포트 방식과 호환 */
const useSubscribePopupImpl = (): PopupAPI => {
  const ctx = useContext(SubscribePopupContext);
  if (!ctx) {
    if (process.env.NODE_ENV !== 'production') {
      // 개발 중엔 원인 파악을 위해 경고만 남김 (throw 금지: 빌드 막음)
      // eslint-disable-next-line no-console
      console.warn('[useSubscribePopup] Provider missing. Using no-op fallback.');
    }
    return FALLBACK;
  }
  return ctx;
};

export default useSubscribePopupImpl;
export const useSubscribePopup = useSubscribePopupImpl;
