import * as XLSX from "xlsx";

export interface ParsedWorkbookRow {
  sheetName: string;
  rowNumber: number;
  values: unknown[];
  object: Record<string, unknown>;
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function looksLikeHeader(row: unknown[]) {
  const joined = row.map((value) => String(value ?? "").toLowerCase()).join(" ");
  const signals = ["product", "program", "rate", "price", "lock", "term"];
  return signals.filter((signal) => joined.includes(signal)).length >= 2;
}

function rowToObject(headers: string[], row: unknown[]) {
  return headers.reduce<Record<string, unknown>>((acc, header, index) => {
    if (!header) return acc;
    acc[header] = row[index] ?? null;
    return acc;
  }, {});
}

function isRateHeader(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "rate" || normalized === "start rate";
}

function numeric(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function matrixProductName(
  sheetName: string,
  matrix: unknown[][],
  headerRowIndex: number,
  rateColumnIndex: number,
) {
  const labels: string[] = [];

  for (let rowIndex = headerRowIndex - 1; rowIndex >= Math.max(0, headerRowIndex - 6); rowIndex--) {
    const row = matrix[rowIndex] ?? [];
    for (let colIndex = rateColumnIndex; colIndex <= rateColumnIndex + 2; colIndex++) {
      const value = row[colIndex];
      const text = String(value ?? "").trim();
      if (!text || text.toLowerCase() === "rate" || text.toLowerCase() === "start rate") continue;
      if (numeric(value) !== null) continue;
      if (!labels.includes(text)) labels.unshift(text);
    }
  }

  const combined = labels.join(" ").replace(/\s+/g, " ").trim();
  return combined ? `${sheetName} ${combined}` : `${sheetName} Rate Matrix`;
}

function emitMatrixRows(sheetName: string, matrix: unknown[][]) {
  const rows: ParsedWorkbookRow[] = [];

  matrix.forEach((row, headerRowIndex) => {
    row.forEach((cell, rateColumnIndex) => {
      if (!isRateHeader(cell)) return;

      const lockColumns: Array<{ columnIndex: number; lockDays: number }> = [];
      for (let offset = 1; offset <= 3; offset++) {
        const lockDays = numeric(row[rateColumnIndex + offset]);
        if (lockDays && lockDays > 0 && lockDays <= 180) {
          lockColumns.push({
            columnIndex: rateColumnIndex + offset,
            lockDays: Math.round(lockDays),
          });
        }
      }

      if (!lockColumns.length) return;

      const productName = matrixProductName(sheetName, matrix, headerRowIndex, rateColumnIndex);

      for (let dataRowIndex = headerRowIndex + 1; dataRowIndex < matrix.length; dataRowIndex++) {
        const dataRow = matrix[dataRowIndex] ?? [];
        const rate = numeric(dataRow[rateColumnIndex]);

        if (rate === null) {
          const hasLaterPriceValue = lockColumns.some(
            (lockColumn) => numeric(dataRow[lockColumn.columnIndex]) !== null,
          );
          if (!hasLaterPriceValue) break;
          continue;
        }

        for (const lockColumn of lockColumns) {
          const price = numeric(dataRow[lockColumn.columnIndex]);
          if (price === null) continue;

          rows.push({
            sheetName,
            rowNumber: dataRowIndex + 1,
            values: dataRow,
            object: {
              product: productName,
              rate,
              price,
              lock_days: lockColumn.lockDays,
              source_format: "prmg_matrix",
              rate_column_index: rateColumnIndex,
              price_column_index: lockColumn.columnIndex,
            },
          });
        }
      }
    });
  });

  return rows;
}

export function parsePrmgWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    raw: false,
  });

  const rows: ParsedWorkbookRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      blankrows: false,
    });

    rows.push(...emitMatrixRows(sheetName, matrix));

    let headers: string[] | null = null;

    matrix.forEach((row, rowIndex) => {
      if (!headers && looksLikeHeader(row)) {
        headers = row.map(normalizeHeader);
        return;
      }

      if (!headers) return;

      const hasValue = row.some((value) => value !== null && String(value).trim() !== "");
      if (!hasValue) return;

      rows.push({
        sheetName,
        rowNumber: rowIndex + 1,
        values: row,
        object: rowToObject(headers, row),
      });
    });
  }

  return {
    sheetNames: workbook.SheetNames,
    rows,
  };
}
