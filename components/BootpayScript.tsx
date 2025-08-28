// BootpayScript.tsx
'use client';
import { useEffect } from 'react';

export default function BootpayScript() {
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.Bootpay) {
      const script = document.createElement('script');
      script.src = 'https://cdn.bootpay.co.kr/js/bootpay-3.3.6.min.js';
      script.async = true;
      script.onload = () => {
        console.log('✅ Bootpay 스크립트 로드 완료');
      };
      script.onerror = () => {
        console.error('❌ Bootpay 스크립트 로드 실패');
      };
      document.body.appendChild(script);
    }
  }, []);

  return null;
}
