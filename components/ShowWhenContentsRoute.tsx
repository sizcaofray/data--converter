'use client'

import { usePathname } from 'next/navigation'

/** 사이드바가 있는 내부 경로일 때에만 children 표시 */
export default function ShowWhenContentsRoute({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const show = [
    '/convert',
    '/compare',
    '/pdf-tool',
    '/pattern-editor',
    '/random',
    '/admin',
  ].some((p) => pathname.startsWith(p))

  if (!show) return null
  return <>{children}</>
}
