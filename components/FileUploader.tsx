'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';

// 🔐 사용자 역할 반환 함수 (Firebase 연동 시 대체 가능)
function getUserRole(): 'admin' | 'paid' | 'free' {
  return 'free'; // 테스트용 기본값
}

export default function FileUploader() {
  // 📂 상태 정의
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'excel-to-other' | 'other-to-excel'>('excel-to-other');
  const [format, setFormat] = useState<'csv' | 'txt'>('csv');

  // 📊 업로드 개수 제한 설정
  const role = getUserRole();
  const maxUploadCount = role === 'admin' ? 100 : role === 'paid' ? 10 : 1;
  const isLimitReached = files.length >= maxUploadCount;

  // 📂 파일 업로드 처리
  const handleFiles = (selectedFiles: FileList | File[]) => {
    setError(null);
    const incoming = Array.from(selectedFiles);

    // 1. 중복 제거
    const newFiles = incoming.filter(incomingFile =>
      !files.some(existingFile =>
        existingFile.name === incomingFile.name && existingFile.size === incomingFile.size
      )
    );

    // 2. 중복만 들어온 경우 → 알림
    if (newFiles.length === 0) {
      alert('❌ 이미 업로드된 파일입니다.');
      return;
    }

    // 3. 총 개수 제한 검사
    const total = files.length + newFiles.length;
    if (total > maxUploadCount) {
      alert(`❌ 최대 ${maxUploadCount}개까지 업로드할 수 있습니다.`);
      setError(`최대 ${maxUploadCount}개까지 업로드 가능합니다. 현재: ${files.length}개`);
      return;
    }

    // 4. 확장자 검사
    const invalid = newFiles.find(file => {
      if (mode === 'excel-to-other') return !file.name.endsWith('.xlsx');
      return !file.name.endsWith('.csv') && !file.name.endsWith('.txt');
    });

    if (invalid) {
      setError(`"${invalid.name}"은(는) 현재 모드에서 지원되지 않는 형식입니다.`);
      return;
    }

    // 5. 추가
    setFiles(prev => [...prev, ...newFiles]);
  };

  // 📖 엑셀 파일 읽기
  const parseExcel = (file: File): Promise<{ [sheetName: string]: any[] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const result: { [sheetName: string]: any[] } = {};
          workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            result[sheetName] = XLSX.utils.sheet_to_json(sheet);
          });
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('엑셀 파일 읽기 실패'));
      reader.readAsArrayBuffer(file);
    });
  };

  // 🔁 CSV 또는 TXT → Excel 변환
  const convertToExcel = async (file: File): Promise<Blob> => {
    const text = await file.text();
    let data: any[] = [];

    if (file.name.endsWith('.csv')) {
      const [headerLine, ...lines] = text.split('\n').map(line => line.trim());
      const headers = headerLine.split(',');
      data = lines.map(line => {
        const values = line.split(',');
        return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));
      });
    } else if (file.name.endsWith('.txt')) {
      data = JSON.parse(text);
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    return new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  };

  // 🔁 업로드된 파일들 변환
  const handleConvert = async () => {
    setError(null);
    if (files.length === 0) {
      setError('먼저 파일을 업로드하세요.');
      return;
    }

    try {
      for (const file of files) {
        if (mode === 'excel-to-other') {
          if (!file.name.endsWith('.xlsx')) throw new Error(`"${file.name}"은(는) 엑셀 파일이 아닙니다.`);
          const sheets = await parseExcel(file);

          for (const [sheetName, jsonData] of Object.entries(sheets)) {
            if (jsonData.length === 0) continue;

            let content = '';
            let mimeType = '';
            let extension = '';

            if (format === 'csv') {
              const header = Object.keys(jsonData[0]).join(',');
              const rows = jsonData.map((row: any) => Object.values(row).join(','));
              content = [header, ...rows].join('\n');
              mimeType = 'text/csv';
              extension = 'csv';
            } else {
              content = JSON.stringify(jsonData, null, 2);
              mimeType = 'text/plain';
              extension = 'txt';
            }

            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${file.name.replace(/\.[^/.]+$/, '')}_${sheetName}.${extension}`;
            a.click();
            URL.revokeObjectURL(url);
          }
        } else {
          if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
            throw new Error(`"${file.name}"은(는) CSV 또는 TXT 파일이 아닙니다.`);
          }

          const blob = await convertToExcel(file);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${file.name.replace(/\.[^/.]+$/, '')}.xlsx`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // 🧲 드래그 앤 드롭 처리
  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files) {
      handleFiles(event.dataTransfer.files);
    }
  }, [mode, files]);

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <div className="space-y-4">
      {/* 변환 모드 선택 */}
      <div className="flex items-center gap-6">
        <label>
          <input type="radio" name="mode" value="excel-to-other" checked={mode === 'excel-to-other'}
            onChange={() => { setMode('excel-to-other'); setFiles([]); setError(null); }} />
          <span className="ml-2">Excel to Other</span>
        </label>
        <label>
          <input type="radio" name="mode" value="other-to-excel" checked={mode === 'other-to-excel'}
            onChange={() => { setMode('other-to-excel'); setFiles([]); setError(null); }} />
          <span className="ml-2">Other to Excel</span>
        </label>
      </div>

      {/* 파일 선택 버튼 */}
      <label
        onClick={(e) => {
          if (files.length >= maxUploadCount) {
            alert(`❌ 이미 업로드된 파일이 ${files.length}개 있습니다. 먼저 삭제하고 다시 시도하세요.`);
            e.preventDefault(); // 파일 선택창 차단
          }
        }}
        className="inline-block cursor-pointer px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
      >
        파일 선택
        <input
          type="file"
          className="hidden"
          multiple
          accept={mode === 'excel-to-other' ? '.xlsx' : '.csv,.txt'}
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = ''; // 중복 허용을 위해 초기화
          }}
          disabled={isLimitReached}
        />
      </label>

      {/* 드래그 앤 드롭 영역 */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        className={`border-2 border-dashed rounded p-10 text-center transition-colors ${
          isLimitReached ? 'border-gray-300 text-gray-400' : 'border-gray-400 text-gray-500 hover:border-blue-500'
        }`}
      >
        {isLimitReached
          ? `최대 ${maxUploadCount}개의 파일을 업로드했습니다.`
          : '여기에 파일을 드래그하세요.'}
      </div>

      {/* 업로드 개수 표시 */}
      {files.length > 0 && (
        <div className="text-sm text-gray-700 dark:text-gray-300">
          업로드 파일: <strong>{files.length}</strong> / 최대 <strong>{maxUploadCount}</strong>개
        </div>
      )}

      {/* 업로드된 파일 목록 */}
      {files.length > 0 && (
        <ul className="list-inside text-sm text-gray-600 space-y-1">
          {files.map((file, idx) => (
            <li key={idx} className="flex items-center text-sm text-gray-700 dark:text-gray-300">
              <span className="mr-2 truncate">{file.name}</span>
              <button
                onClick={() => {
                  const newFiles = [...files];
                  newFiles.splice(idx, 1);
                  setFiles(newFiles);
                }}
                className="text-red-500 hover:text-red-700"
              >
                ❌
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 변환 형식 선택 */}
      {mode === 'excel-to-other' && (
        <div>
          <label htmlFor="format" className="mr-2 font-medium">변환 형식:</label>
          <select
            id="format"
            value={format}
            onChange={(e) => setFormat(e.target.value as 'csv' | 'txt')}
            className="border border-gray-300 rounded px-2 py-1 bg-white text-black dark:bg-gray-800 dark:text-white"
          >
            <option value="csv">CSV</option>
            <option value="txt">TXT</option>
          </select>
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

      {/* 오류 메시지 */}
      {error && (
        <div className="mt-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <strong>⚠️ 오류:</strong> {error}
        </div>
      )}
    </div>
  );
}
