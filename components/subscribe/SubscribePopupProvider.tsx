'use client';
/**
 * SubscribePopupProvider
 * - 구독 팝업 전역 상태를 제공하는 Provider
 * - 현재는 show/open/close/toggle만 관리 (구체 로직은 이후 확장 가능)
 */

import React, { useCallback, useMemo, useState } from 'react';
import { SubscribePopupContext, type PopupAPI } from './SubscribePopupContext';

type Props = {
  /** children 트리를 전역 팝업 컨텍스트로 감쌈 */
  children: React.ReactNode;
  /** 초기 표시 여부 (기본값: false) */
  defaultOpen?: boolean;
};

export function SubscribePopupProvider({ children, defaultOpen = false }: Props) {
  // 전역 팝업 표시 상태
  const [show, setShow] = useState<boolean>(defaultOpen);

  // 제어 함수들 (메모이제이션으로 불필요 렌더 최소화)
  const open = useCallback(() => setShow(true), []);
  const close = useCallback(() => setShow(false), []);
  const toggle = useCallback(() => setShow((s) => !s), []);

  // Context로 제공할 값
  const value: PopupAPI = useMemo(
    () => ({ show, open, close, toggle }),
    [show, open, close, toggle],
  );

  return (
    <SubscribePopupContext.Provider value={value}>
      {children}
    </SubscribePopupContext.Provider>
  );
}

/** default/named 둘 다 export → 기존 임포트 방식 호환성 보장 */
export default SubscribePopupProvider;
