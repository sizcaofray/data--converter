'use client'

/**
 * 홈(/) 커버 페이지
 * - 좌측: 공지사항(컬렉션: notice, 마크다운 모달)
 * - 우측: 기능 카드(표시만, 링크/네비게이션 없음)
 *
 * 중요 변경(최소 수정):
 *  1) Firestore 쿼리에서 orderBy 제거 → 인덱스 없어도 항상 데이터 수신
 *  2) 정렬은 클라이언트에서 pinned 우선 → createdAt 내림차순 유지
 *  3) 빨간 에러문구는 UI에 출력하지 않음(콘솔로만 로그)
 *
 * 디자인/마크업 구조는 기존 그대로입니다.
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

// Firebase Auth 관련
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'

// Firebase App(Auth/DB) – 프로젝트 내 firebase 래퍼
import { auth, db } from '@/lib/firebase/firebase'

// Firestore API
import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
  Timestamp,
} from 'firebase/firestore'

// 공지 내용 렌더링용 마크다운
import ReactMarkdown from 'react-markdown'

// 로그인 시 이동 경로(기존 정책 유지)
const DEFAULT_AFTER_LOGIN = '/convert'

// 우측 카드(표시만; 링크 없음)
const FEATURE_CARDS = [
  { title: 'Data Convert', desc: '엑셀 · CSV · TXT · JSON 변환', emoji: '🔁' },
  { title: 'Compare', desc: '두 파일 비교 · 결과 내보내기', emoji: '🧮' },
  { title: 'PDF Tool', desc: 'PDF 분할 · 병합 · 암호화', emoji: '📄' },
  { title: 'Pattern Editor', desc: '텍스트 치환 · 정규식 편집', emoji: '✍️' },
  { title: 'Random', desc: '랜덤 데이터 · 샘플 생성', emoji: '🎲' },
  { title: 'Admin', desc: '메뉴/제한 설정 (관리자)', emoji: '🛠️' },
]

// 공지 타입 정의
type Notice = {
  id: string
  title: string
  content_md?: string
  pinned?: boolean
  published?: boolean
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export default function HomePage() {
  const router = useRouter()

  // 로그인 상태
  const [user, setUser] = useState<User | null>(null)
  const [authBusy, setAuthBusy] = useState(false)

  // 공지 원본 목록(서버에서 그대로 수신)
  const [rawNotices, setRawNotices] = useState<Notice[]>([])
  const [loadingNotices, setLoadingNotices] = useState(true)

  // 공지 모달 상태
  const [activeNotice, setActiveNotice] = useState<Notice | null>(null)

  /* -----------------------------
   * ① 인증 상태 구독: 로그인 시 /convert 이동(기존 정책)
   * --------------------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      if (u) {
        // 로그인 직후 변환 페이지로 이동(기존 동작 유지)
        router.replace(DEFAULT_AFTER_LOGIN)
      }
    })
    return () => unsub()
  }, [router])

  /* -----------------------------
   * ② 공지 구독
   *    - 서버 쿼리: where(published==true), limit(50)만 사용(= 인덱스 불필요)
   *    - 정렬은 클라에서 pinned 우선 → createdAt desc
   * --------------------------- */
  useEffect(() => {
    try {
      // 컬렉션 참조
      const col = collection(db, 'notice')

      // ✅ 인덱스 요구를 없애기 위해 orderBy는 제거
      //    published=true 조건만 서버에서 필터링하고, 개수는 50개로 제한
      const qy = query(col, where('published', '==', true), limit(50))

      // 실시간 스냅샷 구독
      const unsub = onSnapshot(
        qy,
        (snap) => {
          const rows: Notice[] = []
          snap.forEach((doc) => {
            rows.push({ id: doc.id, ...(doc.data() as Omit<Notice, 'id'>) })
          })
          setRawNotices(rows)
          setLoadingNotices(false)
        },
        (err) => {
          // UI를 깨지지 않게 에러는 콘솔로만 남김
          console.error('[notice] query error:', err?.code, err?.message)
          setRawNotices([]) // 안전 폴백
          setLoadingNotices(false)
        }
      )

      return () => unsub()
    } catch (e: any) {
      console.error('[notice] query exception:', e?.message || e)
      setRawNotices([])
      setLoadingNotices(false)
    }
  }, [])

  /* -----------------------------
   * ③ 클라 정렬:
   *    - pinned(true) 우선
   *    - createdAt 내림차순(최신 우선)
   * --------------------------- */
  const notices = useMemo(() => {
    const arr = [...rawNotices]
    arr.sort((a, b) => {
      const ap = a.pinned ? 1 : 0
      const bp = b.pinned ? 1 : 0
      if (ap !== bp) return bp - ap // pinned=true 먼저
      const at = a.createdAt?.toMillis?.() ?? 0
      const bt = b.createdAt?.toMillis?.() ?? 0
      return bt - at // 최신(createdAt) 먼저
    })
    return arr
  }, [rawNotices])

  // 로그인/로그아웃 동작
  const handleLogin = async () => {
    try {
      setAuthBusy(true)
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      router.replace(DEFAULT_AFTER_LOGIN)
    } finally {
      setAuthBusy(false)
    }
  }
  const handleLogout = async () => {
    try {
      setAuthBusy(true)
      await signOut(auth)
    } finally {
      setAuthBusy(false)
    }
  }

  // 날짜 포맷
  const formatDate = (ts?: Timestamp) => {
    if (!ts) return ''
    const d = ts.toDate()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  // 데이터 존재 여부
  const hasNotices = notices.length > 0

  return (
    <main className="relative flex-1 flex flex-col items-center justify-start px-4">
      {/* 상단 우측: 로그인 박스(기존 디자인 유지) */}
      <div className="absolute right-6 top-14 z-40">
        <div className="rounded-xl border border-white/15 bg-black/30 dark:bg-white/10 backdrop-blur px-4 py-3 shadow-md">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm opacity-90">{user.email}</span>
              <button
                onClick={handleLogout}
                disabled={authBusy}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-60"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              disabled={authBusy}
              className="rounded-md border border-white/20 bg-black/30 px-4 py-2 text-sm text-white hover:bg-black/40 disabled:opacity-60"
            >
              Google 계정으로 로그인
            </button>
          )}
        </div>
      </div>

      {/* 타이틀/설명(기존 유지) */}
      <section className="w-full max-w-6xl mx-auto pt-16 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-3">Data Converter</h1>
        <p className="text-gray-300 dark:text-gray-300 max-w-xl mx-auto leading-relaxed">
          다양한 포맷을 빠르게 변환하고 비교·편집·PDF 도구까지 한 곳에서 이용하세요.
        </p>
      </section>

      {/* 본문 2열 레이아웃(좌: 공지 / 우: 기능 카드) */}
      <section className="w-full max-w-6xl mx-auto mt-10 mb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 좌측: 공지사항 카드 */}
          <div className="rounded-2xl border border-white/10 bg-white/5 dark:bg-white/5 backdrop-blur p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">공지사항</h2>
            </div>

            <div className="max-h-72 overflow-auto pr-1">
              {/* 로딩 표시 */}
              {loadingNotices && <p className="text-sm opacity-70">불러오는 중…</p>}

              {/* 데이터 없음 표시(빨간 에러문구는 사용하지 않음) */}
              {!loadingNotices && !hasNotices && (
                <p className="text-sm opacity-70">등록된 공지가 없습니다.</p>
              )}

              {/* 데이터가 있을 때 목록 렌더 */}
              {hasNotices && (
                <ul className="divide-y divide-white/10">
                  {notices.map((n) => (
                    <li key={n.id} className="py-3">
                      <button
                        onClick={() => setActiveNotice(n)}
                        className="group flex items-start justify-between gap-3 w-full text-left"
                      >
                        <div className="min-w-0">
                          <p className="truncate group-hover:underline">
                            {n.pinned ? '📌 ' : ''}
                            {n.title}
                          </p>
                          <p className="text-xs opacity-60 mt-1">{formatDate(n.createdAt)}</p>
                        </div>
                        <span className="text-sm opacity-60 shrink-0">열기 ›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-xs opacity-60 mt-4">
              ※ 클릭하여 상세내용 확인.
            </p>
          </div>

          {/* 우측: 기능 카드(표시만, 링크 없음) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURE_CARDS.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.03] p-5 shadow-sm flex flex-col select-none"
              >
                <div className="text-3xl mb-3">{f.emoji}</div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="text-sm opacity-80 mt-1">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 공지 상세 모달(마크다운) */}
      {activeNotice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setActiveNotice(null)}
        >
          <div
            className="w-[92vw] max-w-2xl max-h-[80vh] overflow-auto rounded-2xl border border-white/15 bg-neutral-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl font-semibold">
                {activeNotice.pinned ? '📌 ' : ''}
                {activeNotice.title}
              </h3>
              <button
                onClick={() => setActiveNotice(null)}
                className="text-sm opacity-70 hover:opacity-100"
              >
                닫기 ✕
              </button>
            </div>

            <div className="text-xs opacity-60 mt-1">
              {formatDate(activeNotice.createdAt)}
            </div>

            <div className="prose prose-invert mt-4">
              <ReactMarkdown
                components={{
                  // 마크다운 내 링크는 새 탭으로 열기
                  a: ({ node, ...props }) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" />
                  ),
                }}
              >
                {activeNotice.content_md || '_내용이 없습니다._'}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
