'use client';
/**
 * SubscribePopupContext
 * - 구독 팝업 상태(show)와 제어 함수(open/close/toggle)를 담는 Context
 * - 기본값은 null이며, Provider로 감싸지 않으면 훅에서 폴백 처리하도록 설계됨
 */

import { createContext } from 'react';

export type PopupAPI = {
  /** 팝업 표시 여부 */
  show: boolean;
  /** 팝업 열기 */
  open: () => void;
  /** 팝업 닫기 */
  close: () => void;
  /** 팝업 토글 */
  toggle: () => void;
};

/** Provider 미적용 시 null → 훅(useSubscribePopup)에서 폴백 처리 */
export const SubscribePopupContext = createContext<PopupAPI | null>(null);
