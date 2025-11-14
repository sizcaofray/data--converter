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
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore'

// 🔧 KST 기준 오늘(연-월-일만) Date
const kstTodayDateOnly = () => {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000) // UTC+9
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()))
}

// 🔧 종료일 Timestamp가 오늘(KST) 기준으로 지났는지 여부
// - 예: end=11/12, 오늘=11/12 → 사용 가능 (만료 아님)
//       end=11/12, 오늘=11/13 → 만료(true)
const isExpired = (endTs?: Timestamp | null): boolean => {
  if (!endTs) return false
  const end = endTs.toDate()
  const endOnly = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()))
  const todayOnly = kstTodayDateOnly()
  return endOnly.getTime() < todayOnly.getTime()
}

// 🔧 문자열 정규화
const norm = (v: any) => String(v ?? '').trim().toLowerCase()

// 🔑 로그인/세션 감지 시, 구독 만료 계정을 free 로 자동 다운그레이드
const normalizeUserSubscriptionOnLogin = async (user: User) => {
  const userRef = doc(db, 'users', user.uid)
  const snap = await getDoc(userRef)
  if (!snap.exists()) return

  const data = snap.data() as any
  const roleRaw = norm(data.role ?? 'free')
  const isAdmin = roleRaw === 'admin'
  if (isAdmin) return // 관리자는 제외

  const isSubscribed = !!data.isSubscribed
  const endTs = (data.subscriptionEndAt ?? null) as Timestamp | null

  const expired = isExpired(endTs)

  // 이미 free + 미구독이면 변화 없음
  if (!expired || (!isSubscribed && roleRaw === 'free')) return

  await updateDoc(userRef, {
    role: 'free',
    isSubscribed: false,
    subscriptionStartAt: null,
    subscriptionEndAt: null,
  })
}

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
  summary: string
  content_md?: string
  pinned?: boolean
  createdAt?: Timestamp
}

// 좌측 공지 스켈레톤용
const NoticeSkeleton = () => (
  <div className="animate-pulse space-y-2">
    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-5/6" />
    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-4/6" />
  </div>
)

export default function HomePage() {
  const router = useRouter()

  // 로그인 상태
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
      if (!u) return
      // ✅ 로그인 세션 감지 시 만료 계정 자동 다운그레이드 후 메인 기능 페이지로 이동
      normalizeUserSubscriptionOnLogin(u)
        .catch((err) => {
          console.error('로그인 세션 만료 보정 오류:', err)
        })
        .finally(() => {
          router.replace(DEFAULT_AFTER_LOGIN)
        })
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
          snap.forEach((doc) =>
            rows.push({ id: doc.id, ...(doc.data() as Omit<Notice, 'id'>) }),
          )
          setRawNotices(rows)
          setLoadingNotices(false)
        },
        (err) => {
          console.error('공지 구독 오류:', err)
          setLoadingNotices(false)
        },
      )
      return () => unsub()
    } catch (e) {
      console.error('공지 구독 설정 오류:', e)
      setLoadingNotices(false)
    }
  }, [])

  // pinned 우선 → createdAt 내림차순 정렬
  const notices = useMemo(() => {
    const arr = [...rawNotices]
    arr.sort((a, b) => {
      const ap = a.pinned ? 1 : 0
      const bp = b.pinned ? 1 : 0
      if (ap !== bp) return bp - ap // pinned 먼저

      const at = a.createdAt?.toMillis?.() ?? 0
      const bt = b.createdAt?.toMillis?.() ?? 0
      return bt - at // 최신순
    })
    return arr
  }, [rawNotices])

  // 로그인/로그아웃
  const handleLogin = async () => {
    try {
      setAuthBusy(true)
      // 🔐 Google 로그인 수행
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      const user = result.user
      // ✅ 로그인 직후에도 만료 계정이면 free 로 자동 다운그레이드
      await normalizeUserSubscriptionOnLogin(user)
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
    <main
      className="relative flex-1 flex
                 min-h-screen
                 bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200
                 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
    >
      {/* 좌측: 공지 / 안내 */}
      <section className="flex-1 flex flex-col px-10 py-10 max-w-3xl">
        <header className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 dark:bg-slate-900/60 shadow-sm border border-slate-200 dark:border-slate-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-slate-600 dark:text-slate-300">
              데이터 변환 &amp; 비교를 한 번에
            </span>
          </div>

          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Data Converter
          </h1>
          <p className="mt-2 text-base text-slate-600 dark:text-slate-300">
            엑셀, CSV, JSON, 텍스트 파일을 손쉽게 변환하고,
            <br />
            데이터 비교 · 패턴 편집 · 랜덤 데이터 생성까지 한 번에 처리하세요.
          </p>
        </header>

        {/* 공지 영역 */}
        <div className="mt-4 flex-1 flex flex-col rounded-2xl bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                공지사항
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-900/60">
                Notice
              </span>
            </div>
            {hasNotices && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                최신 {Math.min(notices.length, 3)}건 표시
              </span>
            )}
          </div>

          <div className="flex-1 p-4 space-y-3 overflow-y-auto">
            {loadingNotices && (
              <>
                <NoticeSkeleton />
                <NoticeSkeleton />
              </>
            )}

            {!loadingNotices && !hasNotices && (
              <div className="text-xs text-slate-400 dark:text-slate-500">
                등록된 공지사항이 없습니다.
              </div>
            )}

            {!loadingNotices &&
              hasNotices &&
              notices.slice(0, 5).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setActiveNotice(n)}
                  className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/70 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {n.pinned && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-900/60">
                        중요
                      </span>
                    )}
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {n.title}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                    {n.summary}
                  </p>
                  {n.createdAt && (
                    <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                      {formatDate(n.createdAt)}
                    </p>
                  )}
                </button>
              ))}
          </div>
        </div>
      </section>

      {/* 우측: 기능 카드 / 로그인 패널 */}
      <section className="w-full max-w-md border-l border-slate-200/70 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/90 backdrop-blur-sm flex flex-col">
        <div className="flex-1 px-8 py-8 flex flex-col gap-6">
          {/* 로그인 박스 */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 px-4 py-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Account
                </div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {user ? user.email ?? user.displayName ?? '로그인됨' : '로그인이 필요합니다'}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2">
              {user ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={authBusy}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
                >
                  로그아웃
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={authBusy}
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-blue-600 text-white shadow hover:bg-blue-700 disabled:opacity-60"
                >
                  <span className="w-4 h-4 rounded-full bg-white text-blue-600 flex items-center justify-center text-[10px] font-bold">
                    G
                  </span>
                  <span>Google 계정으로 시작하기</span>
                </button>
              )}

              {authBusy && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  처리 중…
                </span>
              )}
            </div>
          </div>

          {/* 기능 카드 목록 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Tools
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                실제 메뉴 이동은 좌측 Sidebar에서 진행됩니다.
              </span>
            </div>

            <div className="space-y-2">
              {FEATURE_CARDS.map((tool) => (
                <div
                  key={tool.title}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 shadow-sm"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg">
                    <span>{tool.emoji}</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {tool.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {tool.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 간단 안내 */}
          <div className="mt-auto text-[11px] text-slate-400 dark:text-slate-500">
            로그인 후, 좌측 사이드바에서 원하는 기능(Data Convert, Compare, PDF Tool 등)을
            선택하여 사용하실 수 있습니다.
          </div>
        </div>

        {/* 공지 모달 */}
        {activeNotice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-lg max-h-[80vh] bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    공지사항
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {activeNotice.title}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveNotice(null)}
                  className="text-xs px-2 py-1 rounded-full border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  닫기
                </button>
              </div>
              <div className="flex-1 p-4 overflow-y-auto text-sm text-slate-800 dark:text-slate-100 prose prose-sm max-w-none dark:prose-invert">
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
      </section>
    </main>
  )
}
