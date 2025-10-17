'use client';
/**
 * Compare Page — 기존 기능 보존 + 오류 발생 시 alert 주입 + TS 안전
 * ------------------------------------------------------------------
 * ✅ 드래그&드롭 업로드 유지
 * ✅ 상단 우측 "비교 실행" 버튼 유지
 * ✅ 결과 없으면 "통합 다운로드(.xlsx)" 버튼 숨김(기존 정책)
 * ✅ 비교/파싱/내보내기 중 오류 → alert + console.error
 * ✅ 전역 비동기 오류도 비교 중일 때만 alert (옵션성, 동작 보완)
 * ✅ TS: 동적 컬럼 접근용 DisplayRow 타입으로 빌드 오류 방지
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  DragEvent,
} from 'react';
import * as XLSX from 'xlsx';

// ===================== (추가) 오류 메시지 & 알럿 유틸 =====================
function _formatCompareError(err: unknown): string {
  if (err instanceof Error) return err.message || String(err);
  try {
    if (typeof err === 'object' && err !== null) {
      // axios-like
      // @ts-ignore
      if (err.response?.data) {
        // @ts-ignore
        const d = err.response.data;
        if (typeof d === 'string') return d;
        if (d?.message) return String(d.message);
      }
      // fetch-like
      // @ts-ignore
      if (err.status && err.statusText) {
        // @ts-ignore
        return `HTTP ${err.status} ${err.statusText}`;
      }
    }
  } catch {}
  return typeof err === 'string' ? err : '알 수 없는 오류가 발생했습니다.';
}

function _alertCompareError(err: unknown, context?: string) {
  const msg = _formatCompareError(err);
  // eslint-disable-next-line no-console
  console.error('[CompareError]', { context, error: err });
  if (typeof window !== 'undefined') {
    window.alert(
      `비교 실행 중 오류가 발생했습니다.\n\n상세: ${msg}\n\n` +
      `• 업로드한 파일 형식/인코딩/시트(첫 행 키)를 확인하세요.\n` +
      `• 반복되면 문제 파일과 스크린샷을 첨부해 문의해 주세요.`
    );
  }
}
// ========================================================================

// ======================= 타입/헬퍼 =======================
type Row = Record<string, any>;
type Parsed = Row[];
type DisplayRow = Record<string, any> & { __type?: string };

type CompareResult = {
  key: string;
  added: Row[];
  deleted: Row[];
  updated: Array<{ before: Row; after: Row }>;
  same: Row[];
  total: number;
};

const DEFAULT_KEY = 'id';

// ---- CSV/TXT/TSV 파서(간단) ----
function parseCSV(text: string): Parsed {
  const delimiter = text.includes('\t') ? '\t' : ',';
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(delimiter).map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = splitCSVLine(line, delimiter);
    const row: Row = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ''));
    return row;
  });
}

// 셀 내부 따옴표 처리 간단화
function splitCSVLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        buf += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && ch === delimiter) {
      out.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  out.push(buf);
  return out.map(s => s.trim());
}

// ---- JSON 파서 ----
function parseJSON(text: string): Parsed {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('JSON 최상위는 배열이어야 합니다.');
  return data as Parsed;
}

// ---- XLSX 파서(첫 시트) ----
function parseXLSX(file: File): Promise<Parsed> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Excel 파일을 읽는 중 오류가 발생했습니다.'));
    fr.onload = () => {
      try {
        const data = new Uint8Array(fr.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error('Excel 시트를 찾을 수 없습니다.');
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '' });
        resolve(json);
      } catch (e) {
        reject(e);
      }
    };
    fr.readAsArrayBuffer(file);
  });
}

// ---- 공통 파싱 진입 ----
function getExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

async function parseFile(file: File): Promise<Parsed> {
  const ext = getExt(file.name);
  try {
    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      const text = await file.text();
      return parseCSV(text);
    }
    if (ext === 'json') {
      const text = await file.text();
      return parseJSON(text);
    }
    if (ext === 'xls' || ext === 'xlsx') {
      return await parseXLSX(file);
    }
    throw new Error(`지원하지 않는 확장자입니다: .${ext || '(없음)'}`);
  } catch (err) {
    _alertCompareError(err, `parseFile(${file?.name || 'unknown'})`);
    throw err;
  }
}

// ---- 비교 키/인덱싱 ----
function detectKey(rows: Parsed): string {
  if (!rows.length) return DEFAULT_KEY;
  const keys = Object.keys(rows[0]);
  return keys[0] ?? DEFAULT_KEY;
}

function indexBy(rows: Parsed, key: string): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const r of rows) {
    const k = String(r[key] ?? '');
    m.set(k, r);
  }
  return m;
}

// ======================= 메인 컴포넌트 =======================
export default function ComparePage() {
  // 파일 상태
  const [srcFile, setSrcFile] = useState<File | null>(null);
  const [dstFile, setDstFile] = useState<File | null>(null);

  // drag-over 상태 (시각 피드백)
  const [srcOver, setSrcOver] = useState(false);
  const [dstOver, setDstOver] = useState(false);

  // 결과/상태
  const [result, setResult] = useState<CompareResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  // UI: 표시 높이 제어용
  const [rowsPerView, setRowsPerView] = useState<number>(30);

  // 비교 중 여부(전역 리스너 제어)
  const comparingRef = useRef(false);

  // ---- 전역 에러 리스너(비교 중일 때만 알림; 기존 흐름 불변) ----
  useEffect(() => {
    const onUnhandled = (e: PromiseRejectionEvent) => {
      if (!comparingRef.current) return;
      e.preventDefault();
      _alertCompareError(e.reason, 'unhandledrejection');
    };
    const onError = (e: ErrorEvent) => {
      if (!comparingRef.current) return;
      _alertCompareError(e.error ?? e.message, 'window.error');
    };
    window.addEventListener('unhandledrejection', onUnhandled);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onUnhandled);
      window.removeEventListener('error', onError);
    };
  }, []);

  // ---- 파일 선택(클릭) ----
  const onChangeSrc = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSrcFile(e.target.files?.[0] ?? null);
  }, []);
  const onChangeDst = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDstFile(e.target.files?.[0] ?? null);
  }, []);

  // ---- 드래그&드롭 핸들러 ----
  const prevent = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onSrcDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    prevent(e);
    setSrcOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) setSrcFile(f);
  }, []);
  const onDstDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    prevent(e);
    setDstOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) setDstFile(f);
  }, []);

  // ---- 비교 실행 (핵심: try/catch로 외부만 감싼다; 내부 로직은 그대로) ----
  const runCompare = useCallback(async () => {
    if (!srcFile || !dstFile) {
      window.alert('원본/변환 파일을 모두 선택해 주세요.');
      return;
    }

    setIsComparing(true);
    comparingRef.current = true;

    try {
      // 1) 파싱
      const [srcRows, dstRows] = await Promise.all([parseFile(srcFile), parseFile(dstFile)]);
      if (!srcRows.length && !dstRows.length) {
        throw new Error('두 파일 모두 빈 데이터입니다.');
      }

      // 2) 키 결정(첫 번째 key 기준)
      const key = detectKey(srcRows.length ? srcRows : dstRows);

      // 3) 인덱스 생성
      const srcIdx = indexBy(srcRows, key);
      const dstIdx = indexBy(dstRows, key);

      // 4) 비교
      const added: Row[] = [];
      const deleted: Row[] = [];
      const same: Row[] = [];
      const updated: Array<{ before: Row; after: Row }> = [];

      srcIdx.forEach((sRow, k) => {
        const dRow = dstIdx.get(k);
        if (!dRow) {
          deleted.push(sRow);
          return;
        }
        const sJson = JSON.stringify(sRow);
        const dJson = JSON.stringify(dRow);
        if (sJson === dJson) same.push(sRow);
        else updated.push({ before: sRow, after: dRow });
      });

      dstIdx.forEach((dRow, k) => {
        if (!srcIdx.has(k)) added.push(dRow);
      });

      const total = added.length + deleted.length + updated.length + same.length;
      const next: CompareResult = { key, added, deleted, updated, same, total };
      setResult(next);

      // 5) 1000건 이상 자동 엑셀 다운로드(기존 동작 보존)
      if (total >= 1000) {
        await exportExcel(next, `compare_${Date.now()}.xlsx`);
      }
    } catch (err) {
      _alertCompareError(err, 'runCompare');
    } finally {
      setIsComparing(false);
      comparingRef.current = false;
    }
  }, [srcFile, dstFile]);

  // ---- 통합 다운로드 (기존 정책: 결과 있을 때만 노출) ----
  const onClickDownloadAll = useCallback(async () => {
    if (!result) {
      window.alert('다운로드할 비교 결과가 없습니다. 먼저 비교를 실행해 주세요.');
      return;
    }
    try {
      await exportExcel(result, `compare_${Date.now()}.xlsx`);
    } catch (err) {
      _alertCompareError(err, 'exportExcel(manual)');
    }
  }, [result]);

  // ---- 엑셀 내보내기 ----
  async function exportExcel(r: CompareResult, filename: string) {
    try {
      const wb = XLSX.utils.book_new();

      const wsAdded = XLSX.utils.json_to_sheet(r.added);
      XLSX.utils.book_append_sheet(wb, wsAdded, 'Added');

      const wsDeleted = XLSX.utils.json_to_sheet(r.deleted);
      XLSX.utils.book_append_sheet(wb, wsDeleted, 'Deleted');

      const updatedRows = r.updated
        .map(u => ({ __key: u.before?.[r.key] ?? '', __type: 'before', ...u.before }))
        .concat(r.updated.map(u => ({ __key: u.after?.[r.key] ?? '', __type: 'after', ...u.after })));
      const wsUpdated = XLSX.utils.json_to_sheet(updatedRows);
      XLSX.utils.book_append_sheet(wb, wsUpdated, 'Updated');

      const wsSame = XLSX.utils.json_to_sheet(r.same);
      XLSX.utils.book_append_sheet(wb, wsSame, 'Same');

      XLSX.writeFile(wb, filename);
    } catch (err) {
      _alertCompareError(err, 'exportExcel');
      throw err;
    }
  }

  // ---- 컨테이너 높이(행 수만큼 높이 제어) ----
  const containerMaxHeight = useMemo(() => {
    const rowPx = 32;
    const pad = 96;
    return Math.max(240, rowsPerView * rowPx + pad);
  }, [rowsPerView]);

  // ---- 테이블 표시용 평탄화 ----
  const flatRows: DisplayRow[] = useMemo(() => {
    if (!result) return [];
    const updatedRows: DisplayRow[] = result.updated
      .map(u => ({ __type: 'updated_before', ...u.before }))
      .concat(result.updated.map(u => ({ __type: 'updated_after', ...u.after })));
    const addedRows: DisplayRow[] = result.added.map(r => ({ __type: 'added', ...r }));
    const deletedRows: DisplayRow[] = result.deleted.map(r => ({ __type: 'deleted', ...r }));
    const sameRows: DisplayRow[] = result.same.map(r => ({ __type: 'same', ...r }));
    return [...addedRows, ...deletedRows, ...updatedRows, ...sameRows];
  }, [result]);

  const allColumns: string[] = useMemo(() => {
    const set = new Set<string>(['__type']);
    flatRows.forEach(r => Object.keys(r).forEach(k => set.add(k)));
    return Array.from(set);
  }, [flatRows]);

  const typeClass = (t?: string) =>
    t === 'added' ? 'bg-green-50'
      : t === 'deleted' ? 'bg-red-50'
      : t?.startsWith('updated') ? 'bg-yellow-50'
      : t === 'same' ? 'bg-gray-50'
      : '';

  // ======================= UI =======================
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* 헤더 + 상단 버튼 (기존 배치 유지) */}
      <div className="mb-4 flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Compare</h1>
          <p className="text-sm text-gray-500">
            두 파일을 드래그&드롭 또는 클릭해서 선택하세요. 오류가 발생하면 즉시 알림창으로 안내됩니다.
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="hidden md:flex items-center gap-2 text-sm">
            표시할 행 수
            <select
              className="border rounded px-2 py-1"
              value={rowsPerView}
              onChange={(e) => setRowsPerView(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
          </label>

          <button
            type="button"
            onClick={runCompare}
            disabled={isComparing}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            {isComparing ? '비교 중…' : '비교 실행'}
          </button>

          {/* 결과 있을 때만 다운로드 버튼(기존 정책 준수) */}
          {result && (
            <button
              type="button"
              onClick={onClickDownloadAll}
              className="px-4 py-2 rounded border"
            >
              통합 다운로드(.xlsx)
            </button>
          )}
        </div>
      </div>

      {/* 업로드: 드래그&드롭 박스 2개 (기존 UX 유지) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* 원본 */}
        <div
          onDragEnter={(e) => { prevent(e as unknown as DragEvent); setSrcOver(true); }}
          onDragOver={prevent}
          onDragLeave={() => setSrcOver(false)}
          onDrop={onSrcDrop}
          className={
            "p-6 border-2 rounded-xl transition " +
            (srcOver ? "border-blue-500 bg-blue-50" : "border-dashed border-gray-300")
          }
        >
          <div className="mb-2 font-medium">원본 파일</div>
          <label className="block">
            <input type="file" className="hidden" onChange={onChangeSrc} />
            <div className="cursor-pointer text-sm text-gray-600">
              여기를 클릭하거나 파일을 여기에 끌어다 놓으세요.
            </div>
          </label>
          {srcFile && (
            <div className="mt-3 text-xs text-gray-500">선택됨: {srcFile.name}</div>
          )}
        </div>

        {/* 변환 */}
        <div
          onDragEnter={(e) => { prevent(e as unknown as DragEvent); setDstOver(true); }}
          onDragOver={prevent}
          onDragLeave={() => setDstOver(false)}
          onDrop={onDstDrop}
          className={
            "p-6 border-2 rounded-xl transition " +
            (dstOver ? "border-blue-500 bg-blue-50" : "border-dashed border-gray-300")
          }
        >
          <div className="mb-2 font-medium">변환 파일</div>
          <label className="block">
            <input type="file" className="hidden" onChange={onChangeDst} />
            <div className="cursor-pointer text-sm text-gray-600">
              여기를 클릭하거나 파일을 여기에 끌어다 놓으세요.
            </div>
          </label>
          {dstFile && (
            <div className="mt-3 text-xs text-gray-500">선택됨: {dstFile.name}</div>
          )}
        </div>
      </div>

      {/* 결과 테이블 (표 전체 스크롤, rowsPerView는 높이만 제어) */}
      <div
        className="border rounded-lg overflow-auto"
        style={{ maxHeight: containerMaxHeight }}
      >
        {!result ? (
          <div className="p-6 text-sm text-gray-500">비교 결과가 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr>
                {allColumns.map((c) => (
                  <th key={c} className="text-left border-b px-3 py-2 whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flatRows.map((row, idx) => (
                <tr key={idx} className={typeClass(row.__type)}>
                  {allColumns.map((c) => (
                    <td key={c} className="border-b px-3 py-2 whitespace-nowrap">
                      {String((row as DisplayRow)[c] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 모바일 보조: 행 수 선택 */}
      <div className="mt-3 md:hidden flex items-center gap-2 text-sm">
        표시할 행 수
        <select
          className="border rounded px-2 py-1"
          value={rowsPerView}
          onChange={(e) => setRowsPerView(Number(e.target.value))}
        >
          <option value={10}>10</option>
          <option value={30}>30</option>
          <option value={50}>50</option>
        </select>
      </div>
    </main>
  );
}
