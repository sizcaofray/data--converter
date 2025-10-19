// 📄 app/(contents)/compare/page.tsx
// -----------------------------------------------------------------------------
// 변경 요약(2025-10-19):
// 1) 비교 실행 시 자동 저장 로직 제거 → "결과 내보내기" 버튼 클릭 시에만 저장 창 표시
// 2) 하단 테이블은 불일치(added/deleted/changed)만 리스트 출력, 동일(same)은 숨김
// -----------------------------------------------------------------------------

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** ------------------------------------------------------------------------
 * 타입 정의
 * ---------------------------------------------------------------------- */
type Row = Record<string, any>;

type ParsedData = {
  rows: Row[];
  keys: string[];
  sourceName: string;
  meta?: Record<string, any>;
};

type DiffItem = {
  key: string | number;
  status: 'added' | 'deleted' | 'changed' | 'same';
  left?: Row | null;
  right?: Row | null;
};

type DiffResult = {
  keyField: string;
  summary: {
    total: number;
    added: number;
    deleted: number;
    changed: number;
    same: number;
  };
  rows: DiffItem[];
};

/** ------------------------------------------------------------------------
 * 알림/오류 패널
 * ---------------------------------------------------------------------- */
function ErrorPanel({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="mt-3 rounded-lg border border-red-400 bg-red-50 p-3 text-sm text-red-700">
      비교 중 오류: {message}
    </div>
  );
}

function InfoPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-700">
      {children}
    </div>
  );
}

/** ------------------------------------------------------------------------
 * 파일 파싱(JSON/CSV/TSV/TXT + (가능하면)XLSX)
 * ---------------------------------------------------------------------- */
async function parseFile(file: File): Promise<ParsedData> {
  const name = file.name || 'file';
  const lower = name.toLowerCase();

  if (lower.endsWith('.json')) {
    const text = await file.text();
    let data = JSON.parse(text);
    if (!Array.isArray(data)) {
      const arrKey = Object.keys(data).find((k) => Array.isArray((data as any)[k]));
      if (arrKey) data = (data as any)[arrKey];
    }
    if (!Array.isArray(data)) throw new Error('JSON에서 배열을 찾을 수 없습니다.');
    const rows: Row[] = data.map((x: any) => (typeof x === 'object' && x ? x : { value: x }));
    const keys = collectKeys(rows);
    return { rows, keys, sourceName: name };
  }

  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
    const text = await file.text();
    const delimiter = lower.endsWith('.tsv') ? '\t' : detectDelimiter(text);
    const rows = parseCSV(text, delimiter);
    const keys = collectKeys(rows);
    return { rows, keys, sourceName: name, meta: { delimiter } };
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsb')) {
    try {
      const XLSX = await import('xlsx');
      const data = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(data, { type: 'array' });
      const firstSheetName = wb.SheetNames?.[0];
      if (!firstSheetName) throw new Error('엑셀 파일에서 시트를 찾을 수 없습니다.');
      const ws = wb.Sheets[firstSheetName];
      const rows: Row[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const keys = collectKeys(rows);
      return { rows, keys, sourceName: `${name}:${firstSheetName}` };
    } catch {
      throw new Error('엑셀 파싱에 실패했습니다. (xlsx 패키지 필요) CSV로 저장 후 다시 시도해 주세요.');
    }
  }

  const fallback = await file.text();
  const rows = parseCSV(fallback, detectDelimiter(fallback));
  const keys = collectKeys(rows);
  return { rows, keys, sourceName: name };
}

/** CSV 파싱 */
function parseCSV(text: string, delimiter: string = ','): Row[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const filtered = lines.filter((l) => l.trim().length > 0);
  if (filtered.length === 0) return [];

  const header = splitCSVLine(filtered[0], delimiter);
  const rows: Row[] = [];

  for (let i = 1; i < filtered.length; i++) {
    const cols = splitCSVLine(filtered[i], delimiter);
    const row: Row = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c] ?? `col${c + 1}`;
      row[key] = cols[c] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

/** CSV 1줄 안전 분리 */
function splitCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === delimiter && !inQuote) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result.map((s) => s.trim());
}

/** 구분자 추정 */
function detectDelimiter(text: string): string {
  const sample = text.slice(0, 2000);
  const comma = (sample.match(/,/g) || []).length;
  const tab = (sample.match(/\t/g) || []).length;
  const semi = (sample.match(/;/g) || []).length;
  if (tab >= comma && tab >= semi) return '\t';
  if (comma >= semi) return ',';
  return ';';
}

/** 키 수집 */
function collectKeys(rows: Row[]): string[] {
  const set = new Set<string>();
  rows.slice(0, 1000).forEach((r) => Object.keys(r || {}).forEach((k) => set.add(k)));
  return Array.from(set);
}

/** ------------------------------------------------------------------------
 * Diff 계산
 * ---------------------------------------------------------------------- */
function buildKeyMap(rows: Row[], keyField: string): Map<string | number, Row> {
  const m = new Map<string | number, Row>();
  for (const r of rows) {
    const k = r?.[keyField];
    if (k === undefined || k === null) continue;
    m.set(k, r);
  }
  return m;
}

function shallowEqual(a?: Row, b?: Row): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function diffRows(left: Row[], right: Row[], keyField: string): DiffResult {
  const leftMap = buildKeyMap(left, keyField);
  const rightMap = buildKeyMap(right, keyField);

  const keys = new Set<string | number>([
    ...Array.from(leftMap.keys()),
    ...Array.from(rightMap.keys()),
  ]);

  const rows: DiffItem[] = [];
  let added = 0,
    deleted = 0,
    changed = 0,
    same = 0;

  for (const k of keys) {
    const l = leftMap.get(k);
    const r = rightMap.get(k);
    if (l && !r) {
      deleted++;
      rows.push({ key: k, status: 'deleted', left: l, right: null });
    } else if (!l && r) {
      added++;
      rows.push({ key: k, status: 'added', left: null, right: r });
    } else {
      if (shallowEqual(l!, r!)) {
        same++;
        rows.push({ key: k, status: 'same', left: l!, right: r! });
      } else {
        changed++;
        rows.push({ key: k, status: 'changed', left: l!, right: r! });
      }
    }
  }

  return {
    keyField,
    summary: { total: rows.length, added, deleted, changed, same },
    rows,
  };
}

/** ------------------------------------------------------------------------
 * 내보내기(엑셀 우선, 실패 시 CSV)
 *  - "결과 내보내기" 버튼에서만 호출됩니다.
 *  - 시트: added / deleted / changed / same
 * ---------------------------------------------------------------------- */
async function exportDiff(result: DiffResult, baseName: string = 'compare_result') {
  try {
    const XLSX = await import('xlsx');
    const toSheet = (items: DiffItem[]) =>
      XLSX.utils.json_to_sheet(
        items.map((x) => ({
          __status: x.status,
          __key: x.key,
          ...prefixKeys(x.left || {}, 'L.'),
          ...prefixKeys(x.right || {}, 'R.'),
        }))
      );

    const wb = XLSX.utils.book_new();
    const { rows } = result;
    const added = rows.filter((r) => r.status === 'added');
    const deleted = rows.filter((r) => r.status === 'deleted');
    const changed = rows.filter((r) => r.status === 'changed');
    const same = rows.filter((r) => r.status === 'same');

    XLSX.utils.book_append_sheet(wb, toSheet(added), 'added');
    XLSX.utils.book_append_sheet(wb, toSheet(deleted), 'deleted');
    XLSX.utils.book_append_sheet(wb, toSheet(changed), 'changed');
    XLSX.utils.book_append_sheet(wb, toSheet(same), 'same');

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    triggerDownload(blob, `${baseName}.xlsx`);
    return;
  } catch {
    // 패키지 부재 또는 쓰기 실패 시 CSV로 대체
  }

  const csvParts: string[] = [];
  const groups: Array<['added'|'deleted'|'changed'|'same', DiffItem[]]> = [
    ['added', result.rows.filter((r) => r.status === 'added')],
    ['deleted', result.rows.filter((r) => r.status === 'deleted')],
    ['changed', result.rows.filter((r) => r.status === 'changed')],
    ['same', result.rows.filter((r) => r.status === 'same')],
  ];
  csvParts.push(`# keyField: ${result.keyField}`);
  for (const [name, items] of groups) {
    csvParts.push('');
    csvParts.push(`## ${name}`);
    const rows = items.map((x) => ({
      __status: x.status,
      __key: x.key,
      ...prefixKeys(x.left || {}, 'L.'),
      ...prefixKeys(x.right || {}, 'R.'),
    }));
    csvParts.push(toCSV(rows));
  }
  const blob = new Blob([csvParts.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${baseName}.csv`);
}

function prefixKeys(obj: Row, prefix: string): Row {
  const out: Row = {};
  Object.keys(obj).forEach((k) => (out[`${prefix}${k}`] = obj[k]));
  return out;
}

function toCSV(rows: Row[]): string {
  if (rows.length === 0) return '';
  const headerSet: Set<string> = rows.reduce<Set<string>>((set, r) => {
    Object.keys(r).forEach((k) => set.add(k));
    return set;
  }, new Set<string>());
  const headers = Array.from(headerSet);

  const escape = (v: any) => {
    if (v == null) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => escape(r[h])).join(','));
  }
  return lines.join('\n');
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

/** ------------------------------------------------------------------------
 * 메인 컴포넌트
 * ---------------------------------------------------------------------- */
export default function ComparePage() {
  // 파일
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);

  // 파싱
  const [parsedA, setParsedA] = useState<ParsedData | null>(null);
  const [parsedB, setParsedB] = useState<ParsedData | null>(null);

  // 기준 키
  const [keyField, setKeyField] = useState<string>('');

  // 상태
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string>('');

  // 결과
  const [diff, setDiff] = useState<DiffResult | null>(null);

  // 테이블 높이 제어
  const [rowsPerView, setRowsPerView] = useState<number>(30);
  const rowHeight = 36;
  const viewportMaxHeight = rowsPerView * rowHeight;

  // 파일 입력 ref
  const inputARef = useRef<HTMLInputElement>(null);
  const inputBRef = useRef<HTMLInputElement>(null);

  // 드래그&드롭
  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, target: 'A' | 'B') => {
      e.preventDefault();
      e.stopPropagation();
      const f = e.dataTransfer.files?.[0];
      if (f) {
        if (target === 'A') setFileA(f);
        else setFileB(f);
      }
    },
    []
  );
  const prevent = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // 파일 → 파싱
  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        if (!fileA) {
          setParsedA(null);
          return;
        }
        const parsed = await parseFile(fileA);
        if (canceled) return;
        setParsedA(parsed);
      } catch (e: any) {
        setParsedA(null);
        setError(`왼쪽 파일 파싱 실패: ${e?.message ?? e}`);
      }
    })();
    return () => { canceled = true; };
  }, [fileA]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        if (!fileB) {
          setParsedB(null);
          return;
        }
        const parsed = await parseFile(fileB);
        if (canceled) return;
        setParsedB(parsed);
      } catch (e: any) {
        setParsedB(null);
        setError(`오른쪽 파일 파싱 실패: ${e?.message ?? e}`);
      }
    })();
    return () => { canceled = true; };
  }, [fileB]);

  // 기본 key 자동 선택(첫 공통 키)
  useEffect(() => {
    const aKeys = parsedA?.keys ?? [];
    const bKeys = parsedB?.keys ?? [];
    const first = aKeys.find((k) => bKeys.includes(k));
    if (first) setKeyField((prev) => prev || first);
  }, [parsedA?.keys?.join(','), parsedB?.keys?.join(',')]);

  // 비교 가능 여부
  const canCompare = useMemo(() => {
    return !!parsedA && !!parsedB && !!keyField && !isRunning;
  }, [parsedA, parsedB, keyField, isRunning]);

  // 비교 실행(자동 저장 없음)
  const onCompare = useCallback(async () => {
    setError('');
    setDiff(null);
    if (!parsedA || !parsedB) {
      setError('좌/우 파일을 모두 선택해 주세요.');
      return;
    }
    if (!keyField) {
      setError('비교 기준 key를 선택해 주세요.');
      return;
    }

    setIsRunning(true);
    console.time('compare');
    try {
      await new Promise((res) => requestAnimationFrame(() => res(null)));
      const result = diffRows(parsedA.rows, parsedB.rows, keyField);
      setDiff(result);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      console.error('[compare:error]', e);
    } finally {
      setIsRunning(false);
      console.timeEnd('compare');
    }
  }, [parsedA, parsedB, keyField]);

  // 결과 내보내기(버튼에서만 호출)
  const onExport = useCallback(async () => {
    if (!diff) return;
    await exportDiff(
      diff,
      `compare_${safeName(parsedA?.sourceName || 'left')}_vs_${safeName(parsedB?.sourceName || 'right')}`
    );
  }, [diff, parsedA?.sourceName, parsedB?.sourceName]);

  // 테이블 행 렌더(불일치만)
  const renderRow = (item: DiffItem) => {
    return (
      <tr key={String(item.key)} className="border-b last:border-b-0">
        <td className="px-3 py-2 text-xs whitespace-nowrap font-semibold">
          {badge(item.status)}
        </td>
        <td className="px-3 py-2 text-xs whitespace-nowrap">{String(item.key)}</td>
        <td className="px-3 py-2 text-xs">
          <pre className="whitespace-pre-wrap break-all">{toPretty(item.left)}</pre>
        </td>
        <td className="px-3 py-2 text-xs">
          <pre className="whitespace-pre-wrap break-all">{toPretty(item.right)}</pre>
        </td>
      </tr>
    );
  };

  // 상태 배지
  function badge(s: DiffItem['status']) {
    const base = 'inline-block rounded px-2 py-0.5 text-[10px] font-bold';
    const tone: Record<string, string> = {
      added: 'bg-emerald-100 text-emerald-700',
      deleted: 'bg-rose-100 text-rose-700',
      changed: 'bg-amber-100 text-amber-700',
      same: 'bg-slate-100 text-slate-600',
    };
    return <span className={`${base} ${tone[s]}`}>{s}</span>;
  }

  // 불일치만 필터
  const mismatchRows = useMemo(
    () => (diff ? diff.rows.filter((r) => r.status !== 'same') : []),
    [diff]
  );

  return (
    <main className="p-6">
      <h1 className="text-xl font-bold mb-4">📊 파일 비교</h1>

      {/* 파일 선택 영역 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 왼쪽 */}
        <div
          onDragEnter={prevent}
          onDragOver={prevent}
          onDrop={(e) => onDrop(e, 'A')}
          className="rounded-xl border border-dashed border-slate-300 p-4"
        >
          <div className="flex items-center justify-between">
            <div className="font-semibold">왼쪽 데이터(A)</div>
            <button type="button" className="text-xs underline" onClick={() => inputARef.current?.click()}>
              파일 선택
            </button>
          </div>
          <input
            ref={inputARef}
            type="file"
            className="hidden"
            onChange={(e) => setFileA(e.target.files?.[0] ?? null)}
            accept=".json,.csv,.tsv,.txt,.xlsx,.xls,.xlsb"
          />
          <div className="mt-3 text-sm text-slate-600">
            {fileA ? (
              <>
                <div className="font-medium">{fileA.name}</div>
                {parsedA && (
                  <div className="text-xs mt-1">
                    {parsedA.rows.length.toLocaleString()}행 · 키 후보 {parsedA.keys.length}개
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs">여기로 드래그하거나 “파일 선택”을 클릭하세요.</div>
            )}
          </div>
        </div>

        {/* 오른쪽 */}
        <div
          onDragEnter={prevent}
          onDragOver={prevent}
          onDrop={(e) => onDrop(e, 'B')}
          className="rounded-xl border border-dashed border-slate-300 p-4"
        >
          <div className="flex items-center justify-between">
            <div className="font-semibold">오른쪽 데이터(B)</div>
            <button type="button" className="text-xs underline" onClick={() => inputBRef.current?.click()}>
              파일 선택
            </button>
          </div>
          <input
            ref={inputBRef}
            type="file"
            className="hidden"
            onChange={(e) => setFileB(e.target.files?.[0] ?? null)}
            accept=".json,.csv,.tsv,.txt,.xlsx,.xls,.xlsb"
          />
          <div className="mt-3 text-sm text-slate-600">
            {fileB ? (
              <>
                <div className="font-medium">{fileB.name}</div>
                {parsedB && (
                  <div className="text-xs mt-1">
                    {parsedB.rows.length.toLocaleString()}행 · 키 후보 {parsedB.keys.length}개
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs">여기로 드래그하거나 “파일 선택”을 클릭하세요.</div>
            )}
          </div>
        </div>
      </div>

      {/* 기준 키, 표시행수, 실행/내보내기 */}
      <div className="mt-4 flex flex-col md:flex-row md:items-end gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">비교 기준 key</label>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={keyField}
            onChange={(e) => setKeyField(e.target.value)}
          >
            <option value="">키 선택</option>
            {mergeKeys(parsedA?.keys, parsedB?.keys).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-600 mb-1">한 번에 표시할 행 수</label>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={rowsPerView}
            onChange={(e) => setRowsPerView(Number(e.target.value))}
          >
            <option value={10}>10</option>
            <option value={30}>30</option>
            <option value={50}>50</option>
          </select>
        </div>

        <div className="flex-1" />

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!canCompare}
            onClick={onCompare}
            className={`rounded px-4 py-2 text-sm font-semibold ${
              canCompare ? 'bg-black text-white hover:opacity-90' : 'bg-slate-200 text-slate-500'
            }`}
          >
            {isRunning ? '비교 중…' : '비교 실행'}
          </button>
          <button
            type="button"
            disabled={!diff}
            onClick={onExport}
            className={`rounded px-4 py-2 text-sm font-semibold ${
              diff ? 'bg-slate-800 text-white hover:opacity-90' : 'bg-slate-200 text-slate-500'
            }`}
          >
            결과 내보내기
          </button>
        </div>
      </div>

      {/* 오류 패널 */}
      <ErrorPanel message={error} />

      {/* 안내(자동 저장 문구 제거) */}
      <InfoPanel>
        <div className="text-xs">
          • JSON/CSV/TSV/TXT를 지원하며, <b>xlsx 패키지</b>가 설치되어 있으면 엑셀(.xlsx)도 자동 파싱합니다.
          <br />• “한 번에 표시할 행 수”는 테이블 <b>높이만</b> 조절하며, 전체 데이터는 스크롤로 확인합니다.
        </div>
      </InfoPanel>

      {/* 결과 섹션: 불일치만 표시 */}
      {diff && (
        <section className="mt-5">
          <div className="text-sm mb-3">
            <span className="font-semibold">기준키:</span> <span className="mr-3">{diff.keyField}</span>
            <span className="mr-3">총 {diff.summary.total.toLocaleString()}건</span>
            <span className="mr-2">추가 {diff.summary.added.toLocaleString()}</span>
            <span className="mr-2">삭제 {diff.summary.deleted.toLocaleString()}</span>
            <span className="mr-2">변경 {diff.summary.changed.toLocaleString()}</span>
            <span className="mr-2 text-slate-500">동일 {diff.summary.same.toLocaleString()} (표시 안함)</span>
          </div>

          {mismatchRows.length === 0 ? (
            <div className="rounded-lg border p-6 text-sm text-slate-600">
              불일치 없음 (모든 레코드가 동일합니다)
            </div>
          ) : (
            <div
              className="rounded-lg border overflow-y-auto"
              style={{ maxHeight: `${viewportMaxHeight}px` }}
            >
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-white dark:bg-gray-900">
                  <tr className="border-b">
                    <th className="px-3 py-2 text-xs w-[90px]">상태</th>
                    <th className="px-3 py-2 text-xs w-[200px]">키</th>
                    <th className="px-3 py-2 text-xs">왼쪽(A)</th>
                    <th className="px-3 py-2 text-xs">오른쪽(B)</th>
                  </tr>
                </thead>
                <tbody>{mismatchRows.map(renderRow)}</tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

/** ------------------------------------------------------------------------
 * 보조 유틸
 * ---------------------------------------------------------------------- */
function mergeKeys(a?: string[], b?: string[]): string[] {
  const s = new Set<string>();
  (a || []).forEach((k) => s.add(k));
  (b || []).forEach((k) => s.add(k));
  return Array.from(s);
}

function toPretty(obj?: Row | null): string {
  if (obj == null) return '';
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '_');
}
