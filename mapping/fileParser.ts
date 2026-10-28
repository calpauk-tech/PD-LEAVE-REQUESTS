import * as XLSX from "xlsx-js-style";
import { ParsedFileResult } from "./types";

/**
 * Resilient File Parser
 * Supports .xlsx, .xls, and .csv
 * Handles UTF-8 with windows-1252 fallback for CSV
 * Normalizes Unicode with NFKC
 * Deduplicates and sanitizes headers
 */
export async function parseSpreadsheetFile(file: File): Promise<ParsedFileResult> {
  const isCsv = file.name.toLowerCase().endsWith(".csv");
  const buffer = await file.arrayBuffer();

  let worksheet: XLSX.WorkSheet;

  if (isCsv) {
    let decodedText: string;
    try {
      const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
      decodedText = utf8Decoder.decode(buffer);
    } catch {
      // Fallback to windows-1252 for legacy/European CSV exports
      const winDecoder = new TextDecoder("windows-1252");
      decodedText = winDecoder.decode(buffer);
    }
    decodedText = decodedText.normalize("NFKC");

    // For CSV files, use raw: true to prevent SheetJS from guessing US date format
    const workbook = XLSX.read(decodedText, { type: "string", raw: true });
    const sheetName = workbook.SheetNames[0];
    worksheet = workbook.Sheets[sheetName];
  } else {
    const data = new Uint8Array(buffer);
    // cellDates: true parses date cells into JS Date objects
    const workbook = XLSX.read(data, { type: "array", cellDates: true });

    // Prioritize "Leave Requests" if present, else sheet 0
    let sheetName = "Leave Requests";
    if (!workbook.Sheets[sheetName]) {
      sheetName = workbook.SheetNames[0];
    }
    worksheet = workbook.Sheets[sheetName];
  }

  if (!worksheet || !worksheet["!ref"]) {
    return {
      fileName: file.name,
      headers: [],
      rawHeaders: [],
      rows: [],
      totalRows: 0,
    };
  }

  // Convert sheet to 2D array of rows with raw: true to preserve JS Date objects and numeric serials
  const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: true,
  });

  if (rawMatrix.length === 0) {
    return {
      fileName: file.name,
      headers: [],
      rawHeaders: [],
      rows: [],
      totalRows: 0,
    };
  }

  // Row 0 is the header row
  const rawHeaderRow = rawMatrix[0];
  const duplicateNotifications: string[] = [];
  const finalHeaders: string[] = [];
  const headerCounts = new Map<string, number>();

  rawHeaderRow.forEach((rawH: any, colIdx: number) => {
    let clean = (rawH === undefined || rawH === null) ? "" : String(rawH).normalize("NFKC").trim();
    if (!clean) {
      clean = `Column_${colIdx + 1}`;
    }

    const currentCount = headerCounts.get(clean) || 0;
    if (currentCount > 0) {
      const uniqueName = `${clean}_${currentCount}`;
      finalHeaders.push(uniqueName);
      headerCounts.set(clean, currentCount + 1);
      duplicateNotifications.push(`Duplicate column "${clean}" was renamed to "${uniqueName}"`);
    } else {
      headerCounts.set(clean, 1);
      finalHeaders.push(clean);
    }
  });

  // Extract remaining rows
  const dataRows: Record<string, any>[] = [];
  for (let r = 1; r < rawMatrix.length; r++) {
    const rowCells = rawMatrix[r];
    // Check if entire row is empty
    const hasData = rowCells && rowCells.some((cell: any) => cell !== undefined && cell !== null && String(cell).trim() !== "");
    if (!hasData) continue;

    const rowObj: Record<string, any> = {};
    finalHeaders.forEach((headerName, colIdx) => {
      let val = rowCells[colIdx];
      if (typeof val === "string") {
        val = val.normalize("NFKC").trim();
      }
      rowObj[headerName] = val ?? "";
    });
    dataRows.push(rowObj);
  }

  return {
    fileName: file.name,
    headers: finalHeaders,
    rawHeaders: rawHeaderRow.map((h: any) => String(h || "")),
    duplicateHeadersNotification: duplicateNotifications.length > 0 ? duplicateNotifications : undefined,
    rows: dataRows,
    totalRows: dataRows.length,
  };
}
