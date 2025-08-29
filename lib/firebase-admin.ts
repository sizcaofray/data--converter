// lib/firebase-admin.ts
// 과거 import('@/lib/firebase-admin') 경로를 새 구조로 우회하는 호환 파일
export { getAdmin } from './firebase/admin';
export { getAdmin as dbAdmin } from './firebase/admin'; // 옛 이름도 지원
