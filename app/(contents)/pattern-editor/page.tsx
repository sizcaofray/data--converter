// app/(contents)/pattern-editor/page.tsx
// 정규식/패턴 기반 텍스트 편집 규칙 구성 · 미리보기 확장 예정 더미 페이지

export default function PatternEditorPage() {
  return (
    <section className="p-4">
      <h1 className="text-2xl font-bold mb-3">🧩 Pattern Editor</h1>
      <ul className="list-disc pl-5 text-sm text-gray-600 dark:text-gray-400 space-y-1">
        <li>입력 텍스트에 패턴 적용 → 결과 미리보기</li>
        <li>자주 쓰는 규칙 저장/불러오기, 내보내기</li>
        <li>대용량 파일 배치 처리와 연계</li>
      </ul>
    </section>
  );
}
