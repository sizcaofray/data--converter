'use client'

/**
 * 홈(/) 커버 페이지
 * - 좌측: 공지사항(컬렉션: notice, 마크다운 모달)
 * - 우측: 기능 카드(표시만, 링크/네비게이션 없음)
 *
 * 변경 사항(요청 반영):
 *  - 일반 사용자에게 불필요한 Admin 카드를 목록에서 제거
 *  - 그 외 로직/디자인은 그대로 유지
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

// Firebase Auth
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'

// Firebase 인스턴스
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

// 공지 본문 마크다운 렌더
import ReactMarkdown from 'react-markdown'

// 로그인 시 이동 경로(정책 유지)
const DEFAULT_AFTER_LOGIN = '/convert'

// 우측 기능 카드(표시만; 링크 없음) — ✅ Admin 항목 제거
const FEATURE_CARDS = [
  { title: 'Data Convert', desc: '엑셀 · CSV · TXT · JSON 변환', emoji: '🔁' },
  { title: 'Compare', desc: '두 파일 비교 · 결과 내보내기', emoji: '🧮' },
  { title: 'PDF Tool', desc: 'PDF 분할 · 병합 · 암호화', emoji: '📄' },
  { title: 'Pattern Editor', desc: '텍스트 치환 · 정규식 편집', emoji: '✍️' },
  { title: 'Random', desc: '랜덤 데이터 · 샘플 생성', emoji: '🎲' },
]

// 공지 타입
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

  // 인증 상태
  const [user, setUser] = useState<User | null>(null)
  const [authBusy, setAuthBusy] = useState(false)

  // 공지 목록
  const [rawNotices, setRawNotices] = useState<Notice[]>([])
  const [loadingNotices, setLoadingNotices] = useState(true)

  // 공지 모달
  const [activeNotice, setActiveNotice] = useState<Notice | null>(null)

  /* 로그인 상태 구독: 로그인 시 /convert 이동(정책 유지) */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      if (u) router.replace(DEFAULT_AFTER_LOGIN)
    })
    return () => unsub()
  }, [router])

  /* 공지 구독
   * - 서버: published == true, 최대 50 (orderBy 제거 → 인덱스 요구 없음)
   * - 정렬: 클라에서 pinned 우선 → createdAt 내림차순
   */
  useEffect(() => {
    try {
      const col = collection(db, 'notice')
      const qy = query(col, where('published', '==', true), limit(50))
      const unsub = onSnapshot(
        qy,
        (snap) => {
          const rows: Notice[] = []
          snap.forEach((doc) => rows.push({ id: doc.id, ...(doc.data() as Omit<Notice, 'id'>) }))
          setRawNotices(rows)
          setLoadingNotices(false)
        },
        (err) => {
          console.error('[notice] query error:', err?.code, err?.message)
          setRawNotices([])
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

  /* 클라 정렬: pinned(true) 우선 → createdAt desc */
  const notices = useMemo(() => {
    const arr = [...rawNotices]
    arr.sort((a, b) => {
      const ap = a.pinned ? 1 : 0
      const bp = b.pinned ? 1 : 0
      if (ap !== bp) return bp - ap
      const at = a.createdAt?.toMillis?.() ?? 0
      const bt = b.createdAt?.toMillis?.() ?? 0
      return bt - at
    })
    return arr
  }, [rawNotices])

  // 로그인/로그아웃
  const handleLogin = async () => {
    try {
      setAuthBusy(true)
      await signInWithPopup(auth, new GoogleAuthProvider())
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

  const hasNotices = notices.length > 0

  return (
    <main className="relative flex-1 flex flex-col items-center justify-start px-4">
      {/* 상단 우측: 로그인 박스 */}
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

      {/* 히어로 */}
      <section className="w-full max-w-6xl mx-auto pt-16 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-3">Data Converter</h1>
        <p className="text-gray-300 dark:text-gray-300 max-w-xl mx-auto leading-relaxed">
          다양한 포맷을 빠르게 변환하고 비교·편집·PDF 도구까지 한 곳에서 이용하세요.
        </p>
      </section>

      {/* 본문 2열: 좌(공지) / 우(기능 카드) */}
      <section className="w-full max-w-6xl mx-auto mt-10 mb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 좌: 공지 */}
          <div className="rounded-2xl border border-white/10 bg-white/5 dark:bg-white/5 backdrop-blur p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">공지사항</h2>
            </div>

            <div className="max-h-72 overflow-auto pr-1">
              {loadingNotices && <p className="text-sm opacity-70">불러오는 중…</p>}

              {!loadingNotices && !hasNotices && (
                <p className="text-sm opacity-70">등록된 공지가 없습니다.</p>
              )}

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
              ※ 공지 작성/수정은 관리자 전용 화면에서 진행하세요(마크다운 지원).
            </p>
          </div>

          {/* 우: 기능 카드(표시만, Admin 제거됨) */}
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

      {/* 공지 상세 모달 */}
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
