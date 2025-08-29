// lib/firebase-admin.ts
// 호환용 얇은 레이어: 예전 import('@/lib/firebase-admin')를
// 새 파일로 우회시켜 빌드 에러를 즉시 제거합니다.
export { getAdmin } from './firebase/admin';
