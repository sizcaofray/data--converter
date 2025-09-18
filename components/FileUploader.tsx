'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';

/**
 * 파일 변환기 (CSV / TXT / XML 중심)
 * - Other → Excel : 여러 파일을 하나의 XLSX로 합쳐 시트 여러 개 생성
 * - Excel → Other : 각 시트를 CSV / TXT / XML 로 개별 다운로드 또는 ZIP 일괄 다운로드
 * - 옵션:
 *   · 인코딩 선택(Other→Excel): UTF-8 / EUC-KR 등
 *   · XML 행 선택자(Other→Excel): 자동 추출이 어려울 때 사용자 지정
 *   · 미리보기(Other→Excel): 첫 파일 30행 미리보기
 *
 * 의존:
 *   - xlsx
 *   - (선택) ZIP 일괄 다운로드 시 jszip (동적 import, 설치 실패 시 개별 다운로드로 폴백)
 */

type Mode = 'excel-to-other' | 'other-to-excel';
type OutputFormat = 'csv' | 'txt' | 'xml';
type ExcelToOtherDownloadMode = 'separate' | 'zip';

const OTHER_ACCEPT_EXTS = ['.csv', '.txt', '.xml'] as const;

/* 시트명 안전화 (31자 제한 + 금지문자 제거 + 중복 방지) */
function sanitizeSheetName(name: string, existing: Set<string>) {
  let s = name.replace(/[\\/?*:\[\]]/g, ' ').substring(0, 31).trim();
  if (!s) s = 'Sheet';
  const base = s;
  let i = 1;
  while (existing.has(s)) {
    const suff = `_${i++}`;
    s = (base.substring(0, Math.max(0, 31 - suff.length)) + suff).trim();
    if (!s) s = `Sheet${i}`;
  }
  existing.add(s);
  return s;
}

/* 키 집합 */
function unionKeys(rows: any[]): string[] {
  const set = new Set<string>();
  rows.forEach(r => Object.keys(r || {}).forEach(k => set.add(k)));
  return Array.from(set);
}

/* CSV 파서 (정교: XLSX 자체 CSV 파서 사용) */
function parseCSV(text: string): any[] {
  const wb = XLSX.read(text, { type: 'string' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet);
}

/* TXT: 한 줄을 한 행으로(value 컬럼) */
function parseTXT(text: string): any[] {
  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(value => ({ value }));
}

/* XML → 시트 맵
   - selector 지정 시 해당 노드들을 한 시트(XML)로 변환
   - 없으면 반복 태그 자동 감지로 여러 시트 생성(휴리스틱) */
function parseXMLtoSheets(xmlText: string, selector?: string): Record<string, any[]> {
  const out: Record<string, any[]> = {};
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const err = doc.querySelector('parsererror');
    if (err) throw new Error('XML 파싱 오류');

    const elementToRow = (el: Element): Record<string, any> => {
      const row: Record<string, any> = {};
      // 속성
      for (const attr of Array.from(el.attributes)) row[`@${attr.name}`] = attr.value;
      const kids = Array.from(el.children) as Element[];
      if (kids.length === 0) {
        row[el.tagName] = el.textContent?.trim() ?? '';
        return row;
      }
      kids.forEach(k => {
        const grandkids = Array.from(k.children) as Element[];
        if (grandkids.length === 0) {
          row[k.tagName] = k.textContent?.trim() ?? '';
        } else {
          // 단순 문자열화 (필요 시 더 정교하게 변환 가능)
          row[k.tagName] = k.textContent?.trim() ?? '';
        }
      });
      return row;
    };

    if (selector && doc.querySelectorAll(selector).length > 0) {
      // 지정 선택자 노드를 한 시트(XML)로
      const nodes = Array.from(doc.querySelectorAll(selector)) as Element[];
      out['XML'] = nodes.map(elementToRow);
      return out;
    }

    // 자동 감지: 동일 태그가 반복되는 자식들을 테이블로 간주
    const collectTables = (node: Element, path = node.tagName) => {
      const childElems = Array.from(node.children) as Element[];
      if (childElems.length === 0) return;

      const freq = new Map<string, Element[]>();
      childElems.forEach(c => {
        const arr = freq.get(c.tagName) ?? [];
        arr.push(c);
        freq.set(c.tagName, arr);
      });

      for (const [tag, elems] of freq) {
        if (elems.length >= 2) {
          const sheetName = `${path}_${tag}`;
          const rows = elems.map(el => elementToRow(el));
          out[sheetName] = rows;
        }
      }

      childElems.forEach(c => collectTables(c, `${path}_${c.tagName}`));
    };

    const root = doc.documentElement;
    collectTables(root, root.tagName);

    // 아무 테이블도 못 찾으면 전체를 한 시트로 보존
    if (Object.keys(out).length === 0) {
      out[root.tagName] = [{ '#text': root.textContent?.trim() ?? '' }];
    }
  } catch {
    out['XML'] = [{ error: 'XML 파싱 실패', raw: xmlText.slice(0, 1000) }];
  }
  return out;
}

/* CSV / TXT / XML 생성기 */
function rowsToCSV(rows: any[]): string {
  if (!rows || rows.length === 0) return '';
  const keys = unionKeys(rows);
  const header = keys.join(',');
  const body = rows.map(r => keys.map(k => String(r?.[k] ?? '')).join(',')).join('\n');
  return [header, body].filter(Boolean).join('\n');
}
function rowsToTXT(rows: any[]): string {
  if (rows.every(r => r && 'value' in r && Object.keys(r).length === 1)) {
    return rows.map(r => String(r.value ?? '')).join('\n');
  }
  return rows.map(r => JSON.stringify(r)).join('\n');
}
const xmlNameOk = (s: string) => /^[A-Za-z_][\w.-]*$/.test(s);
const esc = (s: any) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
function rowsToXML(rows: any[], rootTag = 'rows', rowTag = 'row'): string {
  const keys = unionKeys(rows);
  const open = (t: string, attrs = '') => `<${t}${attrs ? ' ' + attrs : ''}>`;
  const close = (t: string) => `</${t}>`;

  const lines: string[] = [];
  lines.push(open(rootTag));
  rows.forEach(r => {
    lines.push(open(rowTag));
    keys.forEach(k => {
      const v = r?.[k] ?? '';
      if (xmlNameOk(k)) {
        lines.push(`${open(k)}${esc(v)}${close(k)}`);
      } else {
        lines.push(`${open('col', `name="${esc(k)}"`)}${esc(v)}${close('col')}`);
      }
    });
    lines.push(close(rowTag));
  });
  lines.push(close(rootTag));
  return lines.join('');
}

/* 공통 다운로드 */
function downloadBlob(content: Blob, filename: string) {
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ZIP 일괄 다운로드(동적 import, 실패 시 개별 다운로드 폴백) */
async function saveAsZip(files: { path: string; content: string }[], zipName = 'converted.zip') {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    files.forEach(f => zip.file(f.path, f.content));
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, zipName);
  } catch (e) {
    console.warn('ZIP 생성 실패 → 개별 다운로드로 폴백:', e);
    files.forEach(f => {
      const fname = f.path.split('/').pop() || f.path;
      downloadBlob(new Blob([f.content], { type: 'text/plain' }), fname);
    });
  }
}

/* 엑셀 → 시트 맵 */
function parseExcel(file: File): Promise<Record<string, any[]>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const out: Record<string, any[]> = {};
        wb.SheetNames.forEach(name => {
          out[name] = XLSX.utils.sheet_to_json(wb.Sheets[name]);
        });
        resolve(out);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('엑셀 파일 읽기 실패'));
    reader.readAsArrayBuffer(file);
  });
}

export default function FileUploader() {
  /* 상태 */
  const [mode, setMode] = useState<Mode>('excel-to-other');
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<OutputFormat>('csv');                // Excel→Other 출력 포맷
  const [dlMode, setDlMode] = useState<ExcelToOtherDownloadMode>('separate'); // Excel→Other 다운로드 방식
  const [encoding, setEncoding] = useState<'utf-8' | 'euc-kr' | 'shift_jis' | 'iso-8859-1'>('utf-8'); // Other→Excel 인코딩
  const [xmlRowSelector, setXmlRowSelector] = useState<string>('');         // Other→Excel XML 선택자
  const [preview, setPreview] = useState<{ name: string; rows: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* 파일 추가 */
  const handleFiles = (selected: FileList | File[]) => {
    setError(null);
    const list = Array.from(selected || []);
    // 확장자 검증
    const invalid = list.find(f => {
      const lower = f.name.toLowerCase();
      if (mode === 'excel-to-other') return !lower.endsWith('.xlsx');
      return !OTHER_ACCEPT_EXTS.some(ext => lower.endsWith(ext));
    });
    if (invalid) {
      setError(`지원하지 않는 형식: ${invalid.name}`);
      return;
    }
    // 중복 제거(이름+사이즈)
    const dedup = list.filter(f => !files.some(x => x.name === f.name && x.size === f.size));
    if (dedup.length === 0) return;
    setFiles(prev => [...prev, ...dedup]);
  };

  /* DnD */
  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  }, [mode, files]);
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  /* Excel → Other : 내보내기 */
  const exportExcelSheets = async (file: File, outFormat: OutputFormat, dl: ExcelToOtherDownloadMode) => {
    const sheets = await parseExcel(file);
    const base = file.name.replace(/\.[^/.]+$/, '');

    if (dl === 'separate') {
      for (const [sheetName, rows] of Object.entries(sheets)) {
        if (!rows || rows.length === 0) continue;

        let content = '';
        let mime = '';
        let ext = '';

        if (outFormat === 'csv') {
          content = rowsToCSV(rows);
          mime = 'text/csv'; ext = 'csv';
        } else if (outFormat === 'txt') {
          content = rowsToTXT(rows);
          mime = 'text/plain'; ext = 'txt';
        } else {
          content = rowsToXML(rows, 'rows', 'row');
          mime = 'application/xml'; ext = 'xml';
        }

        downloadBlob(new Blob([content], { type: mime }), `${base}_${sheetName}.${ext}`);
      }
    } else {
      // ZIP 일괄 다운로드
      const pack: { path: string; content: string }[] = [];
      for (const [sheetName, rows] of Object.entries(sheets)) {
        if (!rows || rows.length === 0) continue;
        let content = '';
        let ext = '';
        if (outFormat === 'csv') { content = rowsToCSV(rows); ext = 'csv'; }
        else if (outFormat === 'txt') { content = rowsToTXT(rows); ext = 'txt'; }
        else { content = rowsToXML(rows, 'rows', 'row'); ext = 'xml'; }
        pack.push({ path: `${base}/${base}_${sheetName}.${ext}`, content });
      }
      if (pack.length > 0) {
        await saveAsZip(pack, `${base}_${outFormat}.zip`);
      }
    }
  };

  /* Other → Excel : 여러 파일 → 단일 XLSX(다중 시트) */
  async function buildWorkbookFromOtherFiles(inputs: File[]): Promise<XLSX.WorkBook> {
    const wb = XLSX.utils.book_new();
    const used = new Set<string>();

    for (const file of inputs) {
      // 인코딩 적용(브라우저 지원 인코딩: utf-8, euc-kr 등)
      const buf = await file.arrayBuffer();
      let text = '';
      try {
        text = new TextDecoder(encoding).decode(buf);
      } catch {
        text = new TextDecoder('utf-8').decode(buf);
      }

      const lower = file.name.toLowerCase();
      let sheetMap: Record<string, any[]> = {};

      if (lower.endsWith('.csv')) {
        sheetMap = { Sheet1: parseCSV(text) };
      } else if (lower.endsWith('.txt')) {
        sheetMap = { Sheet1: parseTXT(text) };
      } else if (lower.endsWith('.xml')) {
        sheetMap = parseXMLtoSheets(text, xmlRowSelector || undefined);
      } else {
        // 이론상 도달하지 않음(사전 확장자 검증)
        sheetMap = { Sheet1: [{ note: '지원되지 않는 형식' }] };
      }

      const base = file.name.replace(/\.[^/.]+$/, '');
      const multi = Object.keys(sheetMap).length > 1;

      for (const [sub, rows] of Object.entries(sheetMap)) {
        const name = sanitizeSheetName(multi ? `${base}_${sub}` : base, used);
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, name);
      }
    }

    return wb;
  }

  /* Other / Excel 공용 변환 핸들러 */
  const handleConvert = async () => {
    setError(null);
    if (files.length === 0) {
      setError('먼저 파일을 업로드하세요.');
      return;
    }
    try {
      if (mode === 'excel-to-other') {
        for (const f of files) {
          await exportExcelSheets(f, format, dlMode);
        }
      } else {
        const wb = await buildWorkbookFromOtherFiles(files);
        const name =
          files.length === 1
            ? `${files[0].name.replace(/\.[^/.]+$/, '')}.xlsx`
            : `merged_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.xlsx`;
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        downloadBlob(
          new Blob([wbout], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
          name
        );
      }
    } catch (e: any) {
      setError(e?.message || '변환 중 오류가 발생했습니다.');
    }
  };

  /* 미리보기(Other→Excel) */
  async function quickPreview(file: File, enc: string, selector?: string) {
    const lower = file.name.toLowerCase();
    // 엑셀의 경우도 지원(참고용)
    if (lower.endsWith('.xlsx')) {
      const data = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(data, { type: 'array' });
      const first = wb.SheetNames[0];
      return { name: `${file.name}:${first}`, rows: XLSX.utils.sheet_to_json(wb.Sheets[first]) };
    } else {
      const buf = await file.arrayBuffer();
      let text = '';
      try { text = new TextDecoder(enc as any).decode(buf); } catch { text = new TextDecoder('utf-8').decode(buf); }
      if (lower.endsWith('.csv')) return { name: file.name, rows: parseCSV(text) };
      if (lower.endsWith('.txt')) return { name: file.name, rows: parseTXT(text) };
      if (lower.endsWith('.xml')) {
        const map = parseXMLtoSheets(text, selector || undefined);
        const firstKey = Object.keys(map)[0] || 'XML';
        return { name: `${file.name}:${firstKey}`, rows: map[firstKey] ?? [] };
      }
      return { name: file.name, rows: [] };
    }
  }

  return (
    <div className="space-y-4">
      {/* 모드 선택 */}
      <div className="flex items-center gap-6">
        <label>
          <input
            type="radio"
            name="mode"
            value="excel-to-other"
            checked={mode === 'excel-to-other'}
            onChange={() => { setMode('excel-to-other'); setFiles([]); setError(null); setPreview(null); }}
          />
          <span className="ml-2">Excel to Other</span>
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            value="other-to-excel"
            checked={mode === 'other-to-excel'}
            onChange={() => { setMode('other-to-excel'); setFiles([]); setError(null); setPreview(null); }}
          />
          <span className="ml-2">Other to Excel</span>
        </label>
      </div>

      {/* 파일 선택 */}
      <label className="inline-block cursor-pointer px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
        파일 선택
        <input
          type="file"
          className="hidden"
          multiple
          accept={mode === 'excel-to-other' ? '.xlsx' : OTHER_ACCEPT_EXTS.join(',')}
          onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
        />
      </label>

      {/* 드래그 앤 드롭 영역 */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        className="border-2 border-dashed rounded p-10 text-center text-gray-500"
      >
        여기에 파일을 드래그하세요.
      </div>

      {/* 업로드 목록 */}
      {files.length > 0 && (
        <ul className="space-y-1 text-sm">
          {files.map((f, i) => (
            <li key={i} className="flex items-center">
              <span className="mr-2 truncate">{f.name}</span>
              <button
                className="text-red-500 hover:text-red-700"
                onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
              >
                ❌
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Excel → Other 옵션 */}
      {mode === 'excel-to-other' && (
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <label htmlFor="format" className="mr-2 font-medium">출력 형식:</label>
            <select
              id="format"
              value={format}
              onChange={(e) => setFormat(e.target.value as OutputFormat)}
              className="border rounded px-2 py-1"
            >
              <option value="csv">CSV</option>
              <option value="txt">TXT</option>
              <option value="xml">XML</option>
            </select>
          </div>

          <div>
            <label htmlFor="dlMode" className="mr-2 font-medium">다운로드 방식:</label>
            <select
              id="dlMode"
              value={dlMode}
              onChange={(e) => setDlMode(e.target.value as ExcelToOtherDownloadMode)}
              className="border rounded px-2 py-1"
            >
              <option value="separate">시트별 개별 다운로드</option>
              <option value="zip">ZIP으로 일괄 다운로드</option>
            </select>
          </div>
        </div>
      )}

      {/* Other → Excel 옵션 */}
      {mode === 'other-to-excel' && (
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <span className="font-medium">인코딩:</span>
            <select
              value={encoding}
              onChange={(e) => setEncoding(e.target.value as any)}
              className="border rounded px-2 py-1"
            >
              <option value="utf-8">UTF-8</option>
              <option value="euc-kr">EUC-KR(CP949)</option>
              <option value="shift_jis">Shift_JIS</option>
              <option value="iso-8859-1">ISO-8859-1</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="font-medium">XML 행 선택자(선택):</span>
            <input
              type="text"
              value={xmlRowSelector}
              onChange={(e) => setXmlRowSelector(e.target.value)}
              placeholder='예: "row" 또는 "items > item"'
              className="border rounded px-2 py-1 w-64"
            />
          </label>

          <button
            type="button"
            onClick={async () => {
              if (files.length === 0) return;
              const first = files[0];
              const { name, rows } = await quickPreview(first, encoding, xmlRowSelector);
              setPreview({ name, rows: rows.slice(0, 30) });
            }}
            className="px-3 py-1 bg-gray-800 text-white rounded hover:bg-gray-700"
          >
            👀 미리보기(30행)
          </button>
        </div>
      )}

      {/* 미리보기 */}
      {preview && (
        <div className="border rounded p-3 text-sm overflow-auto max-h-72">
          <div className="font-medium mb-2">미리보기: {preview.name}</div>
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                {Array.from(new Set(preview.rows.flatMap(r => Object.keys(r || {})))).slice(0, 20).map((k) => (
                  <th key={k} className="border px-2 py-1 bg-gray-100">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, 30).map((r, i) => (
                <tr key={i}>
                  {Array.from(new Set(preview.rows.flatMap(rr => Object.keys(rr || {})))).slice(0, 20).map((k) => (
                    <td key={k} className="border px-2 py-1">{String(r?.[k] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 변환 버튼 */}
      <button
        onClick={handleConvert}
        className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
        disabled={files.length === 0}
      >
        🔄 파일 변환
      </button>

      {/* 오류 */}
      {error && (
        <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          <strong>⚠️ 오류:</strong> {error}
        </div>
      )}
    </div>
  );
}
