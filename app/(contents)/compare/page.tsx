'use client';

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';

const ACCEPTED_EXTENSIONS = ['.xlsx', '.csv', '.txt', '.json'];

export default function ComparePage() {
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [convertedFile, setConvertedFile] = useState<File | null>(null);
  const [diffResult, setDiffResult] = useState<{
    added: any[];
    removed: any[];
    modified: any[];
    unchanged: any[];
  } | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [isDraggingOriginal, setIsDraggingOriginal] = useState(false);
  const [isDraggingConverted, setIsDraggingConverted] = useState(false);

  const isValidFile = (file: File) => {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    return ACCEPTED_EXTENSIONS.includes(ext);
  };

  const parseFileToJson = async (file: File): Promise<any[]> => {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const text = await file.text();

    if (ext === '.json' || ext === '.txt') {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    }

    if (ext === '.csv') {
      const [headerLine, ...lines] = text.trim().split('\n');
      const headers = headerLine.split(',');
      return lines.map((line) => {
        const values = line.split(',');
        return Object.fromEntries(headers.map((key, i) => [key.trim(), values[i]?.trim() || '']));
      });
    }

    if (ext === '.xlsx') {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      return XLSX.utils.sheet_to_json(firstSheet);
    }

    throw new Error('지원되지 않는 파일 형식입니다.');
  };

  const compareJsonArrays = (original: any[], converted: any[]) => {
    const key = Object.keys(original[0] || converted[0])[0];
    const originalMap = new Map(original.map((row) => [row[key], row]));
    const convertedMap = new Map(converted.map((row) => [row[key], row]));

    const added = converted.filter((row) => !originalMap.has(row[key]));
    const removed = original.filter((row) => !convertedMap.has(row[key]));
    const modified = converted.filter((row) => {
      const orig = originalMap.get(row[key]);
      return orig && JSON.stringify(orig) !== JSON.stringify(row);
    });
    const unchanged = converted.filter((row) => {
      const orig = originalMap.get(row[key]);
      return orig && JSON.stringify(orig) === JSON.stringify(row);
    });

    return { added, removed, modified, unchanged };
  };

  const handleCompare = async () => {
    if (!originalFile || !convertedFile) return;

    try {
      const [originalData, convertedData] = await Promise.all([
        parseFileToJson(originalFile),
        parseFileToJson(convertedFile),
      ]);
      const result = compareJsonArrays(originalData, convertedData);
      setDiffResult(result);
    } catch (err: any) {
      console.error(err);
      alert('❌ 비교 중 오류 발생: ' + err.message);
    }
  };

  const handleDownload = () => {
    if (!diffResult) return;
    const wb = XLSX.utils.book_new();

    const sections = [
      { data: diffResult.added, label: '추가됨' },
      { data: diffResult.removed, label: '삭제됨' },
      { data: diffResult.modified, label: '수정됨' },
      { data: diffResult.unchanged, label: '동일함' },
    ];

    sections.forEach(({ data, label }) => {
      if (data.length > 0) {
        const sheet = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, sheet, label);
      }
    });

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '비교결과_통합파일.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    setFile: (file: File) => void,
    setDragging: (dragging: boolean) => void
  ) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && isValidFile(file)) setFile(file);
    else alert('지원되지 않는 형식입니다.');
  };

  const renderTable = (rows: any[], label: string, color: string) => {
    if (rows.length === 0) return null;
    const keys = Object.keys(rows[0]);
    const maxHeight = pageSize * 40;

    return (
      <div className="mt-10">
        <div className="flex items-center justify-between mb-2">
          <h3 className={`text-lg font-semibold text-${color}-700 dark:text-${color}-400`}>
            {label} ({rows.length}개)
          </h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600 dark:text-gray-300">표시 높이:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white"
            >
              <option value={10}>10개</option>
              <option value={30}>30개</option>
              <option value={50}>50개</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto border rounded overflow-y-scroll" style={{ maxHeight }}>
          <table className="min-w-full text-sm">
            <thead className={`bg-${color}-100 dark:bg-${color}-800`}>
              <tr>
                {keys.map((key) => (
                  <th key={key} className="px-3 py-2 text-left font-semibold text-gray-800 dark:text-white">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t bg-white dark:bg-gray-900">
                  {keys.map((key) => (
                    <td key={key} className="px-3 py-2 text-gray-700 dark:text-gray-300">
                      {row[key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">📊 데이터 비교</h1>

      {/* 업로드 섹션 */}
      {[{
        label: '📝 원본 파일', file: originalFile, setFile: setOriginalFile,
        isDragging: isDraggingOriginal, setDragging: setIsDraggingOriginal,
        color: 'blue'
      }, {
        label: '🔁 변환된 파일', file: convertedFile, setFile: setConvertedFile,
        isDragging: isDraggingConverted, setDragging: setIsDraggingConverted,
        color: 'green'
      }].map(({ label, file, setFile, isDragging, setDragging, color }, idx) => (
        <section
          key={idx}
          className={`border-2 rounded p-6 transition-colors ${
            isDragging ? `border-${color}-500 bg-${color}-50 dark:bg-${color}-900` : 'border-gray-300 bg-gray-50 dark:bg-gray-800'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => handleDrop(e, setFile, setDragging)}
        >
          <h2 className="text-lg font-semibold text-gray-700 dark:text-white mb-2">{label}</h2>
          <input
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(',')}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && isValidFile(f)) setFile(f);
              else alert('지원되지 않는 형식입니다.');
            }}
          />
          <p className="text-sm mt-2 text-gray-600 dark:text-gray-300">또는 드래그해서 여기에 놓기</p>
          {file && (
            <p className={`mt-2 text-sm text-${color}-700 dark:text-${color}-300`}>
              업로드된 파일: <strong>{file.name}</strong>
            </p>
          )}
        </section>
      ))}

      <div className="pt-4">
        <button
          onClick={handleCompare}
          disabled={!originalFile || !convertedFile}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          🔍 비교 시작
        </button>
      </div>

      {diffResult && (
        <>
          <div className="text-right">
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              ⬇ 통합 결과 다운로드
            </button>
          </div>
          {renderTable(diffResult.added, '➕ 추가된 데이터', 'green')}
          {renderTable(diffResult.removed, '➖ 삭제된 데이터', 'red')}
          {renderTable(diffResult.modified, '✏️ 수정된 데이터', 'yellow')}
          {renderTable(diffResult.unchanged, '✅ 동일한 데이터', 'gray')}
        </>
      )}
    </div>
  );
}
