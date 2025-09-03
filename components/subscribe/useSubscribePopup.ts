'use client';
/**
 * useSubscribePopup 훅 (빌드-안전 버전)
 * - Provider가 없으면 production/SSG/SSR에서도 절대 throw하지 않고 no-op 폴백을 반환합니다.
 * - 개발 중(NODE_ENV !== 'production')에는 경고만 출력합니다.
 * - 경로/대소문자 주의: SubscribePopupContext는 같은 폴더의 파일이어야 합니다.
 */
import { useContext } from 'react';
import { SubscribePopupContext, type PopupAPI } from './SubscribePopupContext';

const FALLBACK: PopupAPI = {
  show: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
};

export const useSubscribePopup = (): PopupAPI => {
  const ctx = useContext(SubscribePopupContext);
  if (!ctx) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[useSubscribePopup] Provider missing. Using no-op fallback.');
    }
    return FALLBACK;
  }
  return ctx;
};

export default useSubscribePopup;
