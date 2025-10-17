'use client';
/**
 * Compare Page — 오류 발생 시 alert 즉시 노출 버전
 * ------------------------------------------------------------------
 * ✅ 디자인/마크업 구조는 보존(표 전체 스크롤, 행 수 셀렉트는 높이만 제어)
 * ✅ 1000건↑ 자동 엑셀 다운로드 & 통합 다운로드 버튼 유지
 * ✅ 모든 비교/파싱/다운로드 과정의 예외를 alert + console로 즉시 안내
 * ✅ 전역 비동기 예외도 비교 중일 때만 잡아 alert로 안내
 *
 * 주석을 충분히 남겼습니다. 필요 시 로직만 취사 선택하여 반영하셔도 됩니다.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// 엑셀 다운로드 용 (xlsx)
import * as XLSX from 'xlsx';

// ======================= 공통 유틸: 에러 처리 =======================
/** Error/unknown → 사용자 메시지 문자열 */
function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || String(err);
  // axios/fetch 등 다양한 실패 응답을 방어적으로 처리
  try {
    if (typeof err === 'object' && err !== null) {
      // @ts-ignore
      if (err.response && err.response.data) {
        // @ts-ignore
        const data = err.response.data;
        if (typeof data === 'string') return data;
        if (data?.message) return String(data.message);
      }
      // @ts-ignore
      if (err.status && err.statusText) {
        // @ts-ignore
        return `HTTP ${err.status} ${err.statusText}`;
      }
    }
  } catch (_) {}
  return typeof err === 'string' ? err : '알 수 없는 오류가 발생했습니다.';
}

/** 콘솔 + alert 동시 보고 */
function reportCompareError(err: unknown, context?: string) {
  const msg = formatErrorMessage(err);
  // 디버깅을 위해 원본도 남김
  // eslint-disable-next-line no-console
  console.error('[Compare] 오류', { context, error: err });
  if (typeof window !== 'undefined') {
    const title = '비교 실행 중 오류가 발생했습니다.';
    const hint =
      '• 업로드한 파일 형식/인코딩/시트(첫 행 키 포함) 확인\n' +
      '• CSV→구분자/인코딩, Excel→시트명/헤더 확인\n' +
      '• 반복되면 관리자에게 오류 스크린샷과 함께 파일 전달';
    window.alert(`${title}\n\n상세: ${msg}\n\n${hint}`);
  }
}

// ======================= 타입/헬퍼 =======================
type Row = Record<string, any>;
type Parsed = Row[];

type CompareResult = {
  key: string;              // 비교 기준 키
  added: Row[];             // 변환본에만 있음
  deleted: Row[];           // 원본에만 있음
  updated: Array<{ before: Row; after: Row }>; // 동일 키에서 값 변경
  same: Row[];              // 완전 동일
  total: number;
};

const DEFAULT_KEY = 'id'; // 기본 비교 키(프로젝트 기준 첫 번째 key 사용 가정)

// 간단 CSV 파서(쉼표/탭 모두 지원, 따옴표 최소 처리) — 실제 프로젝트 파서가 있으면 그대로 사용
function parseCSV(text: string): Parsed {
  // 탭 포함 여부로 분기 (가벼운 휴리스틱)
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
      // 연속 따옴표는 escape로 처리
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

// JSON 파서(배열 최상위 가정)
function parseJSON(text: string): Parsed {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('JSON 최상위는 배열이어야 합니다.');
  return data as Parsed;
}

// XLSX 파서(첫 시트 기준, 헤더 자동)
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

// 파일 확장자 판별
function getExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

// 공통 파싱 (CSV/TXT/TSV/JSON/XLSX)
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
  } catch (e) {
    reportCompareError(e, `parseFile(${file.name})`);
    throw e;
  }
}

// 비교: 첫 번째 행의 첫 key 또는 DEFAULT_KEY
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

  // 파싱/비교 결과
  const [result, setResult] = useState<CompareResult | null>(null);

  // 진행 상태
  const [isComparing, setIsComparing] = useState(false);

  // UI: 한 번에 표시할 “행 수” → 실제로는 컨테이너 높이만 제어
  const [rowsPerView, setRowsPerView] = useState<number>(30);

  // 비교 중 여부(전역 리스너 on/off)
  const comparingRef = useRef(false);

  // ========== 전역 에러 리스너(비교 중일 때만 alert) ==========
  useEffect(() => {
    const onUnhandled = (e: PromiseRejectionEvent) => {
      if (!comparingRef.current) return;
      e.preventDefault();
      reportCompareError(e.reason, 'unhandledrejection');
    };
    const onError = (e: ErrorEvent) => {
      if (!comparingRef.current) return;
      reportCompareError(e.error ?? e.message, 'window.error');
    };
    window.addEventListener('unhandledrejection', onUnhandled);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onUnhandled);
      window.removeEventListener('error', onError);
    };
  }, []);

  // ========== 파일 업로드 핸들러 ==========
  const onChangeSrc = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSrcFile(e.target.files?.[0] ?? null);
  }, []);
  const onChangeDst = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDstFile(e.target.files?.[0] ?? null);
  }, []);

  // ========== 비교 실행 ==========
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

      // 2) 비교 key 결정(첫 번째 key)
      const key = detectKey(srcRows.length ? srcRows : dstRows);

      const srcIdx = indexBy(srcRows, key);
      const dstIdx = indexBy(dstRows, key);

      const added: Row[] = [];
      const deleted: Row[] = [];
      const same: Row[] = [];
      const updated: Array<{ before: Row; after: Row }> = [];

      // 원본 기준 비교
      srcIdx.forEach((sRow, k) => {
        const dRow = dstIdx.get(k);
        if (!dRow) {
          deleted.push(sRow);
          return;
        }
        // 값 비교(얕은 비교)
        const sJson = JSON.stringify(sRow);
        const dJson = JSON.stringify(dRow);
        if (sJson === dJson) same.push(sRow);
        else updated.push({ before: sRow, after: dRow });
      });

      // 변환본 기준 추가
      dstIdx.forEach((dRow, k) => {
        if (!srcIdx.has(k)) added.push(dRow);
      });

      const total = added.length + deleted.length + updated.length + same.length;
      const next: CompareResult = { key, added, deleted, updated, same, total };
      setResult(next);

      // 3) 1000건 초과 시 자동 엑셀 다운로드
      if (total >= 1000) {
        await exportExcel(next, `compare_${Date.now()}.xlsx`);
      }
    } catch (e) {
      reportCompareError(e, 'runCompare');
      // 실패해도 UI는 유지
    } finally {
      setIsComparing(false);
      comparingRef.current = false;
    }
  }, [srcFile, dstFile]);

  // ========== 통합 다운로드 버튼 ==========
  const onClickDownloadAll = useCallback(async () => {
    if (!result) {
      window.alert('다운로드할 비교 결과가 없습니다. 먼저 비교를 실행해 주세요.');
      return;
    }
    try {
      await exportExcel(result, `compare_${Date.now()}.xlsx`);
    } catch (e) {
      reportCompareError(e, 'exportExcel(manual)');
    }
  }, [result]);

  // ========== 엑셀 내보내기 ==========
  async function exportExcel(r: CompareResult, filename: string) {
    try {
      const wb = XLSX.utils.book_new();

      // 시트1: Added
      const wsAdded = XLSX.utils.json_to_sheet(r.added);
      XLSX.utils.book_append_sheet(wb, wsAdded, 'Added');

      // 시트2: Deleted
      const wsDeleted = XLSX.utils.json_to_sheet(r.deleted);
      XLSX.utils.book_append_sheet(wb, wsDeleted, 'Deleted');

      // 시트3: Updated(before/after)
      const updatedRows = r.updated.map(u => ({ __key: u.before?.[r.key] ?? '', __type: 'before', ...u.before }))
        .concat(r.updated.map(u => ({ __key: u.after?.[r.key] ?? '', __type: 'after',  ...u.after })));
      const wsUpdated = XLSX.utils.json_to_sheet(updatedRows);
      XLSX.utils.book_append_sheet(wb, wsUpdated, 'Updated');

      // 시트4: Same
      const wsSame = XLSX.utils.json_to_sheet(r.same);
      XLSX.utils.book_append_sheet(wb, wsSame, 'Same');

      XLSX.writeFile(wb, filename);
    } catch (e) {
      reportCompareError(e, 'exportExcel');
      throw e;
    }
  }

  // ========== 테이블 렌더(스크롤 전량 출력, 높이만 rowsPerView 기준) ==========
  const containerMaxHeight = useMemo(() => {
    // 행당 32px + 헤더/여백 약간 → 대략치로 컨테이너 높이 제어
    const rowPx = 32;
    const pad = 96;
    return Math.max(240, rowsPerView * rowPx + pad);
  }, [rowsPerView]);

  const flatRows = useMemo(() => {
    if (!result) return [];
    // 표시는 업데이트를 before/after 두 줄로 보여주는 대신 단순 구분 열 포함으로 한 줄씩
    const updatedRows = result.updated.map(u => ({ __type: 'updated_before', ...u.before }))
      .concat(result.updated.map(u => ({ __type: 'updated_after',  ...u.after })));

    const addedRows   = result.added.map(r => ({ __type: 'added',   ...r }));
    const deletedRows = result.deleted.map(r => ({ __type: 'deleted', ...r }));
    const sameRows    = result.same.map(r => ({ __type: 'same',     ...r }));

    return [
      ...addedRows,
      ...deletedRows,
      ...updatedRows,
      ...sameRows,
    ];
  }, [result]);

  const allColumns = useMemo(() => {
    // 모든 행의 키를 합쳐 컬럼 헤더 생성
    const set = new Set<string>(['__type']);
    flatRows.forEach(r => Object.keys(r).forEach(k => set.add(k)));
    return Array.from(set);
  }, [flatRows]);

  // 타입별 배경(가벼운 식별만)
  const typeClass = (t?: string) =>
    t === 'added' ? 'bg-green-50'
      : t === 'deleted' ? 'bg-red-50'
      : t?.startsWith('updated') ? 'bg-yellow-50'
      : t === 'same' ? 'bg-gray-50'
      : '';

  // ======================= UI =======================
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Compare</h1>
      <p className="text-sm text-gray-500 mb-6">
        두 파일을 선택해 비교하세요. 오류가 발생하면 즉시 알림창으로 안내됩니다.
      </p>

      {/* 업로드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="p-4 border rounded-lg">
          <div className="mb-2 font-medium">원본 파일</div>
          <input type="file" onChange={onChangeSrc} />
          {srcFile && (
            <div className="mt-2 text-xs text-gray-500">선택됨: {srcFile.name}</div>
          )}
        </div>
        <div className="p-4 border rounded-lg">
          <div className="mb-2 font-medium">변환 파일</div>
          <input type="file" onChange={onChangeDst} />
          {dstFile && (
            <div className="mt-2 text-xs text-gray-500">선택됨: {dstFile.name}</div>
          )}
        </div>
      </div>

      {/* 실행/다운로드/행수 */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          type="button"
          onClick={runCompare}
          disabled={isComparing}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {isComparing ? '비교 중…' : '비교 실행'}
        </button>

        <button
          type="button"
          onClick={onClickDownloadAll}
          disabled={!result}
          className="px-4 py-2 rounded border"
        >
          통합 다운로드(.xlsx)
        </button>

        <label className="ml-auto flex items-center gap-2 text-sm">
          한 번에 표시할 행 수
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
      </div>

      {/* 결과 테이블: 전체 행을 스크롤로 모두 출력. rowsPerView는 높이만 제어 */}
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
                      {String(row[c] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
