import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { CheckCircle2, XCircle } from "lucide-react";

function getExpectedUnit(typeDef: any): string {
  if (!typeDef) return "";
  if (typeDef.spendingUnit?.type && typeof typeDef.spendingUnit.type === "string") {
    return typeDef.spendingUnit.type;
  }
  if (typeDef.accruingRate?.unit?.type && typeof typeDef.accruingRate.unit.type === "string") {
    return typeDef.accruingRate.unit.type;
  }
  if (typeDef.unit && typeof typeDef.unit.type === "string") return typeDef.unit.type;
  if (typeof typeDef.unit === "string") return typeDef.unit;
  if (typeof typeDef.type === "string") return typeDef.type;
  return "";
}

function validateReviewItem(item: any, accountTypes: any[]) {
  const errorList: string[] = [];
  if (!item.date) errorList.push("Missing Date");
  if (!item.accountId) errorList.push("Account Not Found");

  let billingMode = item.billingMode;
  let billingModeError = item.billingModeError;

  if (billingMode && billingMode.toLowerCase() === "hour") billingMode = "hours";
  if (billingMode && billingMode.toLowerCase() === "day") billingMode = "days";

  if (item.accountTypeId) {
    const typeDef = accountTypes.find((t: any) => t.id === item.accountTypeId);
    const expectedUnit = getExpectedUnit(typeDef);
    if (expectedUnit) {
      if (billingMode && billingMode.toLowerCase() !== expectedUnit.toLowerCase()) {
        billingModeError = `Template unit is '${billingMode}'. Account expected '${expectedUnit}'. Auto-converted.`;
      } else if (billingMode && billingMode.toLowerCase() === expectedUnit.toLowerCase()) {
        billingModeError = undefined;
      }
      billingMode = expectedUnit;
    }
  }

  let costError = "";
  let cost = Number(item.cost);
  if (!isNaN(cost)) {
    cost = Math.abs(cost);
  }
  
  if (
    item.cost === undefined ||
    item.cost === null ||
    String(item.cost).trim() === ""
  ) {
    costError = "Cost is required";
  } else if (isNaN(cost)) {
    costError = "Cost must be a valid number";
  } else if (
    billingMode &&
    billingMode.toLowerCase() === "days" &&
    cost > 1
  ) {
    costError = "Cost cannot exceed 1 day";
  } else if (
    billingMode &&
    billingMode.toLowerCase() === "hours" &&
    cost > 24
  ) {
    costError = "Cost cannot exceed 24 hours";
  }

  if (costError) errorList.push(costError);

  return {
    ...item,
    cost,
    billingMode,
    billingModeError,
    isValidationError: errorList.length > 0,
    error: errorList.length > 0 ? errorList.join(" | ") : undefined,
  };
}

function applyArrayValidation(reviews: any[]) {
  const grouped = new Map<string, any[]>();
  for (const r of reviews) {
    if (!r.employeeName || !r.accountId) continue;
    const requestStatus = r.requestStatus || "Requested";
    const billingMode = (r.billingMode || "").toLowerCase();
    const key = `${r.employeeName}-${r.accountId}-${billingMode}-${requestStatus}`;
    let g = grouped.get(key);
    if (!g) {
      g = [];
      grouped.set(key, g);
    }
    g.push(r);
  }

  const additionalErrors = new Map<string, string[]>();
  const firstInBundleIds = new Set<string>();
  const subsequentInBundleIds = new Set<string>();
  const requestStartIds = new Set<string>();
  const requestStartDates = new Map<string, string>();
  const requestEndDates = new Map<string, string>();

  for (const group of grouped.values()) {
    const sorted = [...group].sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });

    const chunks: any[][] = [];
    let currentChunk = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i];
      const prev = currentChunk[currentChunk.length - 1];

      if (curr.date && prev.date) {
        const [y1, m1, d1] = prev.date.split("-").map(Number);
        const [y2, m2, d2] = curr.date.split("-").map(Number);
        const dPrev = new Date(y1, m1 - 1, d1);
        const dCurr = new Date(y2, m2 - 1, d2);
        const diffDays = Math.ceil(
          Math.abs(dCurr.getTime() - dPrev.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (diffDays === 1) {
          currentChunk.push(curr);
        } else {
          chunks.push(currentChunk);
          currentChunk = [curr];
        }
      } else {
        chunks.push(currentChunk);
        currentChunk = [curr];
      }
    }
    chunks.push(currentChunk);

    for (const chunk of chunks) {
      if (chunk.length > 0) {
        const first = chunk[0];
        const last = chunk[chunk.length - 1];
        requestStartIds.add(first.id);
        for (const item of chunk) {
          if (first.date) requestStartDates.set(item.id, first.date);
          if (last.date) requestEndDates.set(item.id, last.date);
        }
      }

      if (chunk.length > 1) {
        firstInBundleIds.add(chunk[0].id);
        for (let j = 1; j < chunk.length; j++) {
          subsequentInBundleIds.add(chunk[j].id);
        }
        
        const statuses = new Set(
          chunk.map((c) => c.requestStatus || "Requested"),
        );
        if (statuses.size > 1) {
          for (const c of chunk) {
            const e = additionalErrors.get(c.id) || [];
            if (!e.includes("Inconsistent status in sequential bundle"))
              e.push("Inconsistent status in sequential bundle");
            additionalErrors.set(c.id, e);
          }
        }

        const unitTypes = new Set(
          chunk.map((c) => (c.billingMode || "").toLowerCase()),
        );
        if (unitTypes.size > 1) {
          for (const c of chunk) {
            const e = additionalErrors.get(c.id) || [];
            if (!e.includes("Inconsistent unit type in sequential bundle"))
              e.push("Inconsistent unit type in sequential bundle");
            additionalErrors.set(c.id, e);
          }
        }
      }
    }
  }

  return reviews.map((r) => {
    let baseErrors = r.error ? r.error.split(" | ").filter(Boolean) : [];
    baseErrors = baseErrors.filter(
      (e: string) =>
        e !== "Inconsistent status in sequential bundle" &&
        e !== "Inconsistent unit type in sequential bundle",
    );

    const extra = additionalErrors.get(r.id) || [];
    const combined = [...baseErrors, ...extra];

    return {
      ...r,
      error: combined.length > 0 ? combined.join(" | ") : undefined,
      isValidationError: combined.length > 0,
      isFirstInBundle: firstInBundleIds.has(r.id),
      isSubsequentInBundle: subsequentInBundleIds.has(r.id),
      isRequestStart: requestStartIds.has(r.id),
      requestStartDate: requestStartDates.get(r.id),
      requestEndDate: requestEndDates.get(r.id),
    };
  });
}
import type {
  PlandayApiCredentials,
  AccountType,
  TemplateDataRow,
  AdjustmentReview,
  Department,
  EmployeeGroup,
  EmployeeType,
  Employee,
} from "./types";
import {
  initializeService,
  fetchEmployees,
  fetchLeaveAccounts,
  fetchAccountBalance,
  postAbsenceRequest,
  approveAbsenceRequest,
  denyAbsenceRequest,
  declineAbsenceRecord,
  getAbsenceRequests,
  getAbsenceRecords,
  getAbsenceRequestById,
  getAbsenceRecordById,
  fetchAccountTypes,
  fetchAllValidityPeriods,
  fetchDepartments,
  fetchEmployeeGroups,
  fetchEmployeeTypes,
  fetchPortalInfo,
} from "./services/plandayService";
import * as XLSX from "xlsx-js-style";

// --- Custom Hooks ---
function useUndoableState<T>(initialValue: T, maxHistory: number = 5) {
  const [state, setState] = useState<{ past: T[]; present: T; future: T[] }>({
    past: [],
    present: initialValue,
    future: [],
  });

  const set = useCallback(
    (action: React.SetStateAction<T>) => {
      setState((current) => {
        const nextPresent =
          typeof action === "function"
            ? (action as any)(current.present)
            : action;
        if (current.present === nextPresent) return current;
        const newPast = [...current.past, current.present];
        if (newPast.length > maxHistory) newPast.shift();
        return { past: newPast, present: nextPresent, future: [] };
      });
    },
    [maxHistory],
  );

  const undo = useCallback(() => {
    setState((current) => {
      if (current.past.length === 0) return current;
      const previous = current.past[current.past.length - 1];
      const newPast = current.past.slice(0, current.past.length - 1);
      return {
        past: newPast,
        present: previous,
        future: [current.present, ...current.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((current) => {
      if (current.future.length === 0) return current;
      const next = current.future[0];
      const newFuture = current.future.slice(1);
      const newPast = [...current.past, current.present];
      if (newPast.length > maxHistory) newPast.shift();
      return { past: newPast, present: next, future: newFuture };
    });
  }, [maxHistory]);

  const clearHistory = useCallback((newPresent: T) => {
    setState({ past: [], present: newPresent, future: [] });
  }, []);

  return [
    state.present,
    set,
    undo,
    redo,
    state.past.length,
    state.future.length,
    clearHistory,
  ] as const;
}

// --- Utility Functions ---

// Formats a YYYY-MM-DD string into display format based on preference
const formatDateForDisplay = (
  dateString: string | null | undefined,
  format: "EU" | "US" = "EU",
): string => {
  if (!dateString) return "N/A";
  try {
    // Safe check for YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return "Invalid Date";

    const [year, month, day] = dateString.split("-");

    if (format === "US") {
      return `${month}/${day}/${year}`;
    }
    return `${day}/${month}/${year}`;
  } catch {
    return "Invalid Date";
  }
};

const getAccountCategory = (
  typeId: number,
  accountTypes: AccountType[],
): "FLEX/TOIL" | "Fixed" | "Accrued" | "Unknown" => {
  const type = accountTypes.find((t) => t.id === typeId);
  if (!type) return "Unknown";
  if (type.absenceType === "Flextime") return "FLEX/TOIL";
  if (
    type.accruingRate?.value === 0 &&
    type.accruingRate?.unit?.type === "Percent"
  )
    return "Fixed";
  return "Accrued";
};

const formatDateToYYYYMMDD = (dateString: string): string => {
  if (!dateString || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateString))
    return dateString;
  const [day, month, year] = dateString.split("/");
  return `${year}-${month}-${day}`;
};

/**
 * Smart Date Parser
 * Parses input into YYYY-MM-DD string.
 * Strictly manages Year/Month/Day to avoid timezone shifts.
 */
const parseDateToIso = (
  input: any,
  formatPreference: "EU" | "US",
): string | null => {
  if (!input) return null;

  // 1. Handle JS Date Objects (from Excel Cell Date types)
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    // Always use local methods!
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, "0");
    const d = String(input.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 2. Catch raw serial numbers (General formatting)
  if (typeof input === "number" || /^\d{5}$/.test(String(input))) {
    const serial = parseInt(input, 10);
    if (serial > 20000 && serial < 80000) {
      // Valid bounds for recent dates
      // 25569 is the difference in days between Jan 1 1900 and Jan 1 1970
      const dateObj = new Date(Math.round((serial - 25569) * 86400 * 1000));

      // Use UTC methods here because we calculated pure absolute time from the Unix Epoch
      const y = dateObj.getUTCFullYear();
      const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
      const d = String(dateObj.getUTCDate()).padStart(2, "0");

      return `${y}-${m}-${d}`;
    }
  }

  const str = String(input).trim();
  if (!str) return null;

  // 3. Fallback string parsing for Text-formatted cells
  // Check for ISO format (YYYY-MM-DD) - Always prioritized
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    // Simple validation
    const d = new Date(str);
    if (!isNaN(d.getTime())) return str;
  }

  // 4. Parse Text Formats (e.g., 1/4/25, 01-04-2025)
  // Regex: (1 or 2 digits) [separator] (1 or 2 digits) [separator] (2 or 4 digits)
  const match = str.match(
    /(^|\b)(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2}|\d{4})\b/,
  );
  if (match) {
    let p1 = parseInt(match[2], 10);
    let p2 = parseInt(match[3], 10);
    let year = parseInt(match[4], 10);

    // Handle 2-digit years (Assume 2000s)
    if (year < 100) year += 2000;

    let day, month;

    if (formatPreference === "US") {
      // MM/DD/YYYY
      month = p1;
      day = p2;
    } else {
      // EU: DD/MM/YYYY
      day = p1;
      month = p2;
    }

    // Basic logical validation
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    // Strict Date validation (e.g. checks Feb 30th -> invalid)
    // We do NOT use ISOString() here to avoid timezone shifts.
    const dateObj = new Date(year, month - 1, day);
    if (
      dateObj.getFullYear() === year &&
      dateObj.getMonth() === month - 1 &&
      dateObj.getDate() === day
    ) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
};

interface ColumnDetectionResult {
  format: "EU" | "US";
  source: "detected" | "fallback" | "inherited" | "empty"; // 'detected' means we found unambiguous dates, 'fallback' means ambiguous or empty, 'inherited' means copied from validFrom/To, 'empty' means no real dates found
  hasConflict: boolean;
  conflictDetails: string[];
  exampleRowIndex?: number; // 0-based index from the JSON array
  exampleReason?: string;
}

/**
 * Scans a list of rows to detect format per column.
 * - Detects conflicts (e.g. Row 2 is EU, Row 5 is US).
 * - Returns detailed result.
 */
const detectColumnFormat = (
  rows: any[],
  columnKey: string,
  fallbackFormat: "EU" | "US",
): ColumnDetectionResult => {
  let unambiguousUS: { row: number; val: string; index: number }[] = [];
  let unambiguousEU: { row: number; val: string; index: number }[] = [];
  let ambiguousSample: { row: number; val: string; index: number } | null =
    null;
  let hasAnyDateLike = false;

  rows.forEach((row, index) => {
    const val = row[columnKey];
    if (val === undefined || val === null || val === "") return;

    // Treat checking 'N/A' as not a date at all.
    if (typeof val === "string" && val.trim().toUpperCase() === "N/A") return;

    if (val instanceof Date) {
      hasAnyDateLike = true;
      return;
    } // Unambiguous Date obj
    if (typeof val === "number" || /^\d{5}$/.test(String(val))) {
      hasAnyDateLike = true;
      return;
    } // Unambiguous Serial

    const str = String(val).trim();

    // Skip ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      hasAnyDateLike = true;
      return;
    }

    const match = str.match(
      /(^|\b)(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2}|\d{4})\b/,
    );
    if (match) {
      hasAnyDateLike = true;
      const p1 = parseInt(match[2], 10);
      const p2 = parseInt(match[3], 10);
      const year = parseInt(match[4], 10);

      // Invalid checks
      if (p1 > 31 && p2 > 31) return; // garbage
      if (p1 === 0 || p2 === 0) return;

      // Unambiguous US Check: Month First.
      // If p1 <= 12 AND p2 > 12. Example: 04/30/2025.
      if (p1 <= 12 && p2 > 12) {
        unambiguousUS.push({ row: index + 2, val: str, index: index }); // +2 for Excel Row (0-based + header)
      }

      // Unambiguous EU Check: Day First.
      // If p1 > 12 AND p2 <= 12. Example: 30/04/2025.
      if (p1 > 12 && p2 <= 12) {
        unambiguousEU.push({ row: index + 2, val: str, index: index });
      }

      // Capture first ambiguous one for fallback example (e.g. 01/02/2025)
      if (!ambiguousSample && p1 <= 12 && p2 <= 12) {
        ambiguousSample = { row: index + 2, val: str, index: index };
      }
    }
  });

  // Check for Critical Conflict within the same column
  if (unambiguousUS.length > 0 && unambiguousEU.length > 0) {
    // Collect first few examples
    const examples = [
      ...unambiguousUS
        .slice(0, 2)
        .map((i) => `Row ${i.row}: ${i.val} (US Format)`),
      ...unambiguousEU
        .slice(0, 2)
        .map((i) => `Row ${i.row}: ${i.val} (EU Format)`),
    ];

    return {
      format: fallbackFormat, // Irrelevant, blocking error
      source: "detected",
      hasConflict: true,
      conflictDetails: examples,
    };
  }

  if (unambiguousUS.length > 0)
    return {
      format: "US",
      source: "detected",
      hasConflict: false,
      conflictDetails: [],
      exampleRowIndex: unambiguousUS[0].index,
      exampleReason: `Detected US format (Month/Day/Year) in Row ${unambiguousUS[0].row}: "${unambiguousUS[0].val}"`,
    };

  if (unambiguousEU.length > 0)
    return {
      format: "EU",
      source: "detected",
      hasConflict: false,
      conflictDetails: [],
      exampleRowIndex: unambiguousEU[0].index,
      exampleReason: `Detected EU format (Day/Month/Year) in Row ${unambiguousEU[0].row}: "${unambiguousEU[0].val}"`,
    };

  // If there were no dates found at all (e.g. all empty or 'N/A')
  if (!hasAnyDateLike) {
    return {
      format: fallbackFormat,
      source: "empty",
      hasConflict: false,
      conflictDetails: [],
    };
  }

  // If mixed (conflicting) or all ambiguous, use fallback
  return {
    format: fallbackFormat,
    source: "fallback",
    hasConflict: false,
    conflictDetails: [],
    exampleRowIndex: ambiguousSample ? ambiguousSample.index : undefined,
    exampleReason: ambiguousSample
      ? `Date "${ambiguousSample.val}" in Row ${ambiguousSample.row} is ambiguous (could be EU or US). Defaulting to app setting (${fallbackFormat}).`
      : undefined,
  };
};

const getTodayYYYYMMDD = () => {
  const local = new Date();
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const EditableCell = ({
  value,
  onChange,
  disabled,
  type = "text",
  width = "w-20",
  min,
  max,
  align = "right",
}: {
  value: string | number;
  onChange: (val: any) => void;
  disabled?: boolean;
  type?: "text" | "number" | "textarea";
  width?: string;
  min?: number;
  max?: number;
  align?: "left" | "right" | "center";
}) => {
  const [localValue, setLocalValue] = useState(String(value));

  useEffect(() => {
    if (type === "number") {
      const parsedLocal = parseFloat(localValue);
      const parsedNew = parseFloat(String(value));
      if (
        !isNaN(parsedLocal) &&
        !isNaN(parsedNew) &&
        parsedLocal === parsedNew &&
        String(value) !== ""
      ) {
        return;
      }
    }
    setLocalValue(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, type]);

  if (type === "textarea") {
    return (
      <textarea
        className={`${width} text-${align} bg-transparent border-b border-dashed focus:outline-none focus:border-blue-500 font-sans border-gray-300 hover:border-gray-400 text-gray-800 resize-y p-1 rounded min-h-[32px]`}
        value={localValue}
        rows={1}
        onChange={(e) => {
          setLocalValue(e.target.value);
        }}
        onBlur={() => {
          if (localValue !== String(value)) {
            onChange(localValue);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        disabled={disabled}
        onInput={(e) => {
          const target = e.target as HTMLTextAreaElement;
          target.style.height = "auto";
          target.style.height = `${target.scrollHeight}px`;
        }}
      />
    );
  }

  return (
    <input
      type={type}
      className={`${width} text-${align} bg-transparent border-b border-dashed focus:outline-none focus:border-blue-500 font-mono border-gray-300 hover:border-gray-400 text-gray-800`}
      value={localValue}
      onChange={(e) => {
        let val = e.target.value;
        if (type === "number" && val !== "" && val !== "-") {
          let parsed = parseFloat(val);
          if (!isNaN(parsed)) {
            if (max !== undefined && parsed > max) {
              val = String(max);
              parsed = max;
            }
            if (min !== undefined && parsed < min) {
              val = String(min);
              parsed = min;
            }
            onChange(parsed);
          }
        } else if (type === "number" && val === "") {
          onChange("");
        } else if (type !== "number") {
          onChange(val);
        }
        setLocalValue(val);
      }}
      disabled={disabled}
      min={min}
      max={max}
      onBlur={() => {
        if (type === "number") {
          if (localValue.trim() === "") return onChange("");
          let parsed = parseFloat(localValue);
          if (!isNaN(parsed)) {
            if (max !== undefined && parsed > max) parsed = max;
            if (min !== undefined && parsed < min) parsed = min;
            onChange(parsed);
            setLocalValue(String(parsed));
          } else onChange(localValue);
        } else {
          onChange(localValue);
        }
      }}
    />
  );
};
// --- SVG Icons ---
const FilterIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
    />
  </svg>
);
const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M5 13l4 4L19 7"
    />
  </svg>
);
const CopyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
);
const InfoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);
const DownloadIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
    />
  </svg>
);
const ExclamationIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);
const CalendarIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  </svg>
);
const RefreshIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);
const UploadCloudIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
    />
  </svg>
);
const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);
const SortAscIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
    />
  </svg>
);
const SortDescIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M3 4h13M3 8h9m-9 4h5m4 0v12m0 0l4-4m-4 4l-4-4"
    />
  </svg>
);

// --- UI Components ---
const PageHeader: React.FC = () => (
  <div className="text-center">
    <h1 className="text-4xl font-bold text-gray-800 flex items-center justify-center gap-3">
      Planday Bulk Leave Requests
      <span className="bg-blue-500 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full">
        BETA
      </span>
    </h1>
    <p className="mt-2 text-lg text-gray-500">
      Upload leave requests in bulk or migrate leave accounts
    </p>
  </div>
);

const Loader: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex items-center text-gray-500">
    <svg
      className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
    <span>{text}</span>
  </div>
);

const ProgressBar: React.FC<{ progress: number; text: string }> = ({
  progress,
  text,
}) => (
  <div className="w-full flex flex-col items-center">
    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
      <div
        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      ></div>
    </div>
    <div className="flex justify-between w-full text-xs text-gray-500 font-medium">
      <span>{text}</span>
      <span>{Math.round(progress)}%</span>
    </div>
  </div>
);

const Stepper: React.FC<{
  current: number;
  steps: { title: string; subtitle: string }[];
}> = ({ current, steps }) => {
  return (
    <nav aria-label="Progress">
      <ol role="list" className="flex items-center">
        {steps.map((step, index) => {
          const isResultsStep = index === steps.length - 1;
          const isCompleted = index < current;
          // If it is the results step and active, show it as completed/green check
          const isResultsActive = isResultsStep && index === current;
          const showCheck = isCompleted || isResultsActive;

          return (
            <li
              key={step.title}
              className={`relative ${index !== steps.length - 1 ? "flex-1" : ""}`}
            >
              <div className="flex items-center text-sm font-medium">
                <span
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${showCheck ? "bg-green-600" : index === current ? "bg-blue-600" : "bg-gray-300"}`}
                >
                  {showCheck ? (
                    <CheckIcon className="h-6 w-6 text-white" />
                  ) : (
                    <span
                      className={
                        index === current ? "text-white" : "text-gray-600"
                      }
                    >
                      {index + 1}
                    </span>
                  )}
                </span>
                <div className="ml-4 hidden md:block">
                  <span
                    className={`block text-sm font-semibold ${showCheck ? "text-green-600" : index === current ? "text-blue-600" : "text-gray-500"}`}
                  >
                    {step.title}
                  </span>
                  <span className="block text-sm text-gray-500">
                    {step.subtitle}
                  </span>
                </div>
              </div>
              {index !== steps.length - 1 && (
                <div
                  className={`absolute top-5 left-10 -ml-px mt-px h-0.5 w-full ${index < current ? "bg-green-600" : "bg-gray-300"}`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

// --- Main App & Step Components ---
type AppStep =
  | "auth"
  | "configure"
  | "migrateOptions"
  | "upload"
  | "review"
  | "processing"
  | "summary";
type ValidityMode = "current" | "current_future" | "custom";
type UpdateMethod = "excel" | "migrate";

const getStepConfig = (method: UpdateMethod) => ({
  labels: [
    { title: "Authentication", subtitle: "Connect to Planday" },
    method === "excel"
      ? { title: "Configure", subtitle: "Download template" }
      : { title: "Select Accounts", subtitle: "Choose accounts to upload" },
    ...(method === "excel"
      ? [{ title: "Upload", subtitle: "Upload Excel file" }]
      : [{ title: "Migrate Options", subtitle: "Choose migration method" }]),
    {
      title: "Review",
      subtitle: method === "excel" ? "Final review" : "Migrate Requests",
    },
    { title: "Upload Process", subtitle: "Send requests" },
    { title: "Results", subtitle: "View results" },
  ],
  order:
    method === "excel"
      ? ([
          "auth",
          "configure",
          "upload",
          "review",
          "processing",
          "summary",
        ] as const)
      : (["auth", "configure", "migrateOptions", "review", "processing", "summary"] as const),
});

interface DateReportExample {
  rowNumber: number;
  employee: string;
  account: string;
  columnName: string;
  rawValue: string;
  convertedValue: string;
  detectedFormat: string;
}

interface MultiSelectDropdownProps {
  label: string;
  pluralLabel?: string;
  options: { id: number | string; name: string }[];
  selectedIds: Set<string>;
  onChange: (selectedIds: Set<string>) => void;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  label,
  pluralLabel,
  options,
  selectedIds,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allChecked = selectedIds.size === options.length && options.length > 0;
  const isIndeterminate =
    selectedIds.size > 0 && selectedIds.size < options.length;

  const filteredOptions = options.filter((o) =>
    o.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const isSearchActive = searchTerm.trim().length > 0;
  const allFilteredChecked =
    filteredOptions.length > 0 &&
    filteredOptions.every((o) => selectedIds.has(String(o.id)));
  const isFilteredIndeterminate =
    !allFilteredChecked &&
    filteredOptions.some((o) => selectedIds.has(String(o.id)));

  const handleSelectAll = () => {
    if (isSearchActive) {
      const newSet = new Set(selectedIds);
      if (allFilteredChecked) {
        filteredOptions.forEach((o) => newSet.delete(String(o.id)));
      } else {
        filteredOptions.forEach((o) => newSet.add(String(o.id)));
      }
      onChange(newSet);
    } else {
      if (allChecked) {
        onChange(new Set());
      } else {
        onChange(new Set(options.map((o) => String(o.id))));
      }
    }
  };

  const handleToggle = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    onChange(newSet);
  };

  const displayPlural = pluralLabel || label + "s";
  const displayValue =
    allChecked || selectedIds.size === 0
      ? `All ${displayPlural}`
      : `${selectedIds.size} selected`;

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        className="w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 flex justify-between items-center cursor-pointer focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-[38px]"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate text-gray-700">{displayValue}</span>
        <span className="text-gray-500 text-xs ml-2">▼</span>
      </div>

      {isOpen && (
        <div className="absolute z-50 mx-0 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto focus:outline-none">
          <div className="p-2 border-b border-gray-200 sticky top-0 bg-white z-20">
            <input
              type="text"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div className="p-2 flex flex-col gap-1">
            <label className="flex items-center space-x-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={isSearchActive ? allFilteredChecked : allChecked}
                ref={(input) => {
                  if (input)
                    input.indeterminate = isSearchActive
                      ? isFilteredIndeterminate
                      : isIndeterminate;
                }}
                onChange={handleSelectAll}
                className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-gray-300"
              />
              <span className="text-sm font-medium text-gray-900">
                {isSearchActive ? "Select all" : "All"}
              </span>
            </label>

            {filteredOptions.map((option) => (
              <label
                key={option.id}
                className="flex items-center space-x-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(String(option.id))}
                  onChange={() => handleToggle(String(option.id))}
                  className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-gray-300"
                />
                <span className="text-sm text-gray-700">{option.name}</span>
              </label>
            ))}
            {filteredOptions.length === 0 && (
              <div className="text-center text-gray-500 text-sm py-3">
                No results
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<AppStep>("auth");
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    const checkVersion = async () => {
      try {
        const res = await fetch("/version.json?t=" + new Date().getTime());
        if (res.ok) {
          const data = await res.json();
          if (data.version && data.version !== "1.1") {
            setShowUpdateBanner(true);
            clearInterval(intervalId);
          }
        }
      } catch (e) {
        // Silently fail if version.json is missing or unreadable
      }
    };

    checkVersion();
    intervalId = setInterval(checkVersion, 60000); // Check every minute

    return () => clearInterval(intervalId);
  }, []);

  const [updateMethod, setUpdateMethod] = useState<UpdateMethod>("excel");
  const [credentials, setCredentials] = useState<
    PlandayApiCredentials | undefined
  >();
  const [portalName, setPortalName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState({
    types: false,
    template: false,
    submitting: false,
  });
  const [loadingText, setLoadingText] = useState("");
  const [progress, setProgress] = useState(0);
  const [processingPhase, setProcessingPhase] = useState<number>(0);
  const [processingLogs, setProcessingLogs] = useState<{message: string, type: "info" | "success" | "error"}[]>([]);
  const [proceedToStep2, setProceedToStep2] = useState<(() => void) | null>(null);
  const [step1SuccessCount, setStep1SuccessCount] = useState(0);
  const [step1ErrorCount, setStep1ErrorCount] = useState(0);
  const abortRef = useRef<boolean>(false);
  const mixedRequestsDataRef = useRef<{ empId: number, reqId: number, otherRegs: any[], originalAbsenceType: string, fromDates: string[] }[]>([]);
  const oldNotesDataRef = useRef<{ empId: number, start: string, end: string, note: string }[]>([]);
  const deniedRequestsDataRef = useRef<any[]>([]);
  const mixedRequestsExportDataRef = useRef<any[]>([]);

  const addLog = (message: string, type: "info" | "success" | "error" = "info") => {
    setProcessingLogs((prev) => [...prev, { message, type }]);
  };

  const handleAbort = () => {
    abortRef.current = true;
    if (proceedToStep2) {
       proceedToStep2();
    }
  };

  // Step 2 State
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [accountTypesSearch, setAccountTypesSearch] = useState("");

  // NEW FILTER STATE
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employeeGroups, setEmployeeGroups] = useState<EmployeeGroup[]>([]);
  const [employeeTypes, setEmployeeTypes] = useState<EmployeeType[]>([]);

  const [usePrimaryDepartmentOnly, setUsePrimaryDepartmentOnly] =
    useState(false);
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<
    Set<string>
  >(new Set());
  const [selectedEmployeeGroupIds, setSelectedEmployeeGroupIds] = useState<
    Set<string>
  >(new Set());
  const [selectedEmployeeTypeIds, setSelectedEmployeeTypeIds] = useState<
    Set<string>
  >(new Set());

  const [selectedTypeIds, setSelectedTypeIds] = useState<Set<number>>(
    new Set(),
  );
  const [migrateFromAccountId, setMigrateFromAccountId] = useState<
    number | null
  >(null);
  const [migrateToAccountId, setMigrateToAccountId] = useState<number | null>(
    null,
  );
  const [migrateValidityPeriodsMap, setMigrateValidityPeriodsMap] =
    useState<Record<number, { start: string; end: string } | null> | null>(
      null,
    );
  const [migratePeriodMode, setMigratePeriodMode] = useState<"full" | "custom">("full");
  const [migrateDateRange, setMigrateDateRange] = useState({ start: "", end: "" });
  const [migrateDaysToHoursRatio, setMigrateDaysToHoursRatio] = useState<number>(7.4);
  const [validityMode, setValidityMode] = useState<ValidityMode>("current");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  // Default to empty strings/null to force user selection
  const [balanceDate, setBalanceDate] = useState("");
  const [includeBalance, setIncludeBalance] = useState<boolean | null>(null);
  const [balanceOptionError, setBalanceOptionError] = useState<string | null>(
    null,
  );
  const [includeInactive, setIncludeInactive] = useState(false);
  const [includeEmployeeAccounts, setIncludeEmployeeAccounts] =
    useState<boolean>(false);
  const [downloadDateFormat, setDownloadDateFormat] = useState<"EU" | "US">(
    "EU",
  );

  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);

  // Step 3 & 4 State
  const [fetchedTemplateData, setFetchedTemplateData] = useState<
    TemplateDataRow[]
  >([]);
  const [
    adjustmentsToReview,
    setAdjustmentsToReview_raw,
    undoAdjustments,
    redoAdjustments,
    pastLength,
    futureLength,
    clearAdjustmentsHistory_raw,
  ] = useUndoableState<AdjustmentReview[]>([], 5);

  const setAdjustmentsToReview = React.useCallback(
    (action: React.SetStateAction<AdjustmentReview[]>) => {
      setAdjustmentsToReview_raw((prev) => {
        const next =
          typeof action === "function" ? (action as any)(prev) : action;
        return applyArrayValidation(next);
      });
    },
    [setAdjustmentsToReview_raw],
  );

  const clearAdjustmentsHistory = React.useCallback(
    (newPresent: AdjustmentReview[]) => {
      clearAdjustmentsHistory_raw(applyArrayValidation(newPresent));
    },
    [clearAdjustmentsHistory_raw],
  );
  // Review Step - Sort & Select State
  const [sortConfig, setSortConfig] = useState<{
    key: keyof AdjustmentReview | "status";
    direction: "asc" | "desc";
  } | null>(null);
  const [bulkCustomDate, setBulkCustomDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [errorFilterRowIds, setErrorFilterRowIds] =
    useState<Set<string> | null>(null);

  // Review Step - Filters
  const [selectedReviewIds, setSelectedReviewIds] = useState<Set<string>>(
    new Set(),
  );
  const [reviewDepartmentIds, setReviewDepartmentIds] = useState<Set<string>>(
    new Set(),
  );
  const [reviewEmployeeGroupIds, setReviewEmployeeGroupIds] = useState<
    Set<string>
  >(new Set());
  const [reviewEmployeeTypeIds, setReviewEmployeeTypeIds] = useState<
    Set<string>
  >(new Set());
  const [reviewLeaveAccountNames, setReviewLeaveAccountNames] = useState<
    Set<string>
  >(new Set());

  // Review Step - Pagination State
  const [reviewRowsPerPage, setReviewRowsPerPage] = useState<number | "All">(
    50,
  );
  const [reviewPage, setReviewPage] = useState<number>(1);

  // Bulk Edit State
  const [bulkEditField, setBulkEditField] = useState<
    "cost" | "billingMode" | "date" | "start" | "end" | "comment" | ""
  >("");
  const [bulkEditValueCost, setBulkEditValueCost] = useState<string>("");
  const [bulkEditValueBillingMode, setBulkEditValueBillingMode] =
    useState<string>("");
  const [bulkEditEffectiveDateType, setBulkEditEffectiveDateType] = useState<
    "custom" | "today" | "start_date"
  >("today");
  const [bulkEditValueEffectiveDate, setBulkEditValueEffectiveDate] =
    useState<string>("");
  const [bulkEditValueComment, setBulkEditValueComment] = useState<string>("");
  const [bulkEditValueAdjustment, setBulkEditValueAdjustment] =
    useState<string>("");
  const [bulkEditValueNewBalance, setBulkEditValueNewBalance] =
    useState<string>("");

  const [detectedColumnFormats, setDetectedColumnFormats] = useState<{
    effective: ColumnDetectionResult;
    validFrom: ColumnDetectionResult;
    validTo: ColumnDetectionResult;
  } | null>(null);
  const [uploadConflicts, setUploadConflicts] = useState<
    { column: string; details: string[] }[] | null
  >(null);
  const [uploadValidityErrors, setUploadValidityErrors] = useState<
    { row: number; details: string[] }[] | null
  >(null);
  const [dateReportExample, setDateReportExample] =
    useState<DateReportExample | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Store uploaded file to allow re-processing with different settings
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);

  // Floating Tooltip State
  const [activeTooltip, setActiveTooltip] = useState<{
    x: number;
    y: number;
    content: React.ReactNode;
  } | null>(null);

  // Step 5 State
  const [updateSummary, setUpdateSummary] = useState<AdjustmentReview[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showAbortModal, setShowAbortModal] = useState(false);
  const [showRemoveConfirmModal, setShowRemoveConfirmModal] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [showBackConfirmModal, setShowBackConfirmModal] = useState(false);
  const [validationFailedState, setValidationFailedState] = useState<{
    errors: string[];
    resolve: (action: "revalidate" | "skip" | "abort") => void;
  } | null>(null);
  const [showUpdateBalanceModal, setShowUpdateBalanceModal] = useState(false);
  const [showStopProcessModal, setShowStopProcessModal] = useState(false);
  const [isUpdatingBalances, setIsUpdatingBalances] = useState(false);

  useEffect(() => {
    try {
      const savedCreds = sessionStorage.getItem("plandayCredentials");
      if (savedCreds) handleAuthSuccess(JSON.parse(savedCreds));
    } catch (e) {
      console.error("Failed to parse saved credentials", e);
    }
  }, []);

  const loadConfigData = async () => {
    setIsLoading((prev) => ({ ...prev, types: true }));
    try {
      const types = await fetchAccountTypes();
      setAccountTypes(types); // Important to set this to exit the loading loop dependencies
    } catch (err: any) {
      handleApiError(err);
    }

    try {
      const info = await fetchPortalInfo();
      setPortalName(info.name);
    } catch (err: any) {
      console.error("Failed to load portal info", err);
    }

    try {
      const depts = await fetchDepartments();
      setDepartments(depts);
      setSelectedDepartmentIds(new Set(depts.map((d) => String(d.id))));
    } catch (err: any) {
      setError((prev) => (prev ? `${prev} | ${err.message}` : err.message));
    }

    try {
      const groups = await fetchEmployeeGroups();
      setEmployeeGroups(groups);
      setSelectedEmployeeGroupIds(new Set(groups.map((g) => String(g.id))));
    } catch (err: any) {
      setError((prev) => (prev ? `${prev} | ${err.message}` : err.message));
    }

    try {
      const eTypes = await fetchEmployeeTypes();
      setEmployeeTypes(eTypes);
      setSelectedEmployeeTypeIds(new Set(eTypes.map((t) => String(t.id))));
    } catch (err: any) {
      setError((prev) => (prev ? `${prev} | ${err.message}` : err.message));
    }

    try {
      const employees = await fetchEmployees();
      setAllEmployees(employees);
    } catch (err: any) {
      console.error("Failed to fetch employees for review filtering", err);
    }

    setIsLoading((prev) => ({ ...prev, types: false }));
  };

  useEffect(() => {
    if (currentStep === "configure" && accountTypes.length === 0) {
      loadConfigData();
    }
  }, [currentStep, accountTypes.length]);

  const handleApiError = (err: any) => {
    const message = err.message || "An unknown error occurred.";
    setError(message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (message.includes("re-enter them")) {
      setCurrentStep("auth");
      setCredentials(undefined);
      // Ensure types are cleared if we are forced to re-auth
      setAccountTypes([]);
      setSelectedTypeIds(new Set());
    }
  };

  useEffect(() => {
    let controller: AbortController | null = null;

    if (
      updateMethod === "migrate" &&
      accountTypes.length > 0 &&
      migrateValidityPeriodsMap === null
    ) {
      controller = new AbortController();
      const activeTypeIds = accountTypes
        .filter((a) => !a.isDeleted)
        .map((a) => a.id);
      if (activeTypeIds.length > 0) {
        fetchAllValidityPeriods(activeTypeIds, controller.signal)
          .then((res) => setMigrateValidityPeriodsMap(res))
          .catch((err) => {
            if (err.name !== "AbortError") {
              console.error(err);
            }
          });
      } else {
        setMigrateValidityPeriodsMap({});
      }
    }

    return () => {
      if (controller) {
        controller.abort();
      }
    };
  }, [updateMethod, accountTypes, migrateValidityPeriodsMap]);

  const handleAuthSuccess = (creds: PlandayApiCredentials) => {
    sessionStorage.setItem("plandayCredentials", JSON.stringify(creds));
    initializeService(creds);
    setCredentials(creds);

    // Reset configuration state on new auth to force re-fetch of account types
    setAccountTypes([]);
    setSelectedTypeIds(new Set());
    setMigrateValidityPeriodsMap(null);

    setCurrentStep("configure");
    setError(null);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("plandayCredentials");
    setCurrentStep("auth");
    setCredentials(undefined);

    // Clear configuration data
    setAccountTypes([]);
    setSelectedTypeIds(new Set());
    setMigrateValidityPeriodsMap(null);
  };

  const resetReviewSessionState = (data: AdjustmentReview[]) => {
    setSearchQuery("");
    setSortConfig(null);
    setSelectedReviewIds(new Set());
    setBulkEditField("");
    setBulkEditValueAdjustment("");
    setBulkEditValueNewBalance("");
    setBulkEditEffectiveDateType("today");
    setBulkEditValueEffectiveDate("");
    setBulkEditValueComment("");

    setReviewPage(1);
    setReviewRowsPerPage(50);

    setReviewDepartmentIds(new Set(departments.map((d) => String(d.id))));
    setReviewEmployeeGroupIds(new Set(employeeGroups.map((g) => String(g.id))));
    setReviewEmployeeTypeIds(new Set(employeeTypes.map((t) => String(t.id))));
    if (data.length > 0) {
      setReviewLeaveAccountNames(
        new Set(Array.from(new Set(data.map((r) => r.accountName)))),
      );
    } else {
      setReviewLeaveAccountNames(new Set());
    }
  };

  const handleStartOver = () => {
    setBalanceOptionError(null);
    clearAdjustmentsHistory([]);
    setUpdateSummary([]);
    setFetchedTemplateData([]);
    setDetectedColumnFormats(null);
    setUploadConflicts(null);
    setUploadValidityErrors(null);
    setDateReportExample(null);
    setLastUploadedFile(null);
    setSortConfig(null);
    setSearchQuery("");
    setHasAttemptedSubmit(false);
    setCurrentStep("configure");
    setError(null);
  };

  const handleRetryFailed = () => {
    const failedRows = updateSummary
      .filter((s) => s.status === "error")
      .map((s) => {
        const resetRow = { ...s };
        resetRow.status = "pending";
        resetRow.error = undefined;
        resetRow.timestamp = undefined;
        return resetRow;
      });

    if (failedRows.length === 0) return;
    
    setAdjustmentsToReview(failedRows as any);
    setUpdateSummary([]);
    setCurrentStep("review");
  };

  const handleDownloadTemplate = async () => {
    if (updateMethod === "migrate") {
      if (!migrateFromAccountId || !migrateToAccountId) {
        setError("Please select both source and destination accounts.");
        return;
      }
      if (migrateFromAccountId === migrateToAccountId) {
        setError("Source and destination accounts must be different.");
        return;
      }
    } else if (updateMethod !== "excel" && selectedTypeIds.size === 0) {
      setError("Please select at least one account type.");
      return;
    }

    setIsLoading((prev) => ({ ...prev, template: true }));
    setProgress(0);
    setError(null);
    clearAdjustmentsHistory([]);
    setSortConfig(null);
    setSearchQuery("");
    setUploadConflicts(null);
    setUploadValidityErrors(null);
    abortRef.current = false;

    try {
      const FETCH_BATCH_SIZE = 50;
      setLoadingText("Fetching all employees...");
      setProgress(5);
      let employees = await fetchEmployees();

      // basic local filtering
      if (
        departments.length > 0 &&
        selectedDepartmentIds.size > 0 &&
        selectedDepartmentIds.size < departments.length
      ) {
        employees = employees.filter((emp) => {
          if (Array.isArray(emp.departments))
            return emp.departments.some(
              (d) =>
                selectedDepartmentIds.has(String(d)) ||
                selectedDepartmentIds.has(String(d.department)) ||
                selectedDepartmentIds.has(String(d.id)),
            );
          else if (emp.departmentId !== undefined)
            return selectedDepartmentIds.has(String(emp.departmentId));
          return false;
        });
      }

      setProgress(10);

      if (updateMethod === "migrate") {
        setProgress(100);
        setCurrentStep("migrateOptions");
      } else if (updateMethod === "excel") {
        const allAccountsWithEmployeeInfo: any[] = [];
        if (includeEmployeeAccounts) {
          setLoadingText("Fetching accounts for the template...");
          for (let i = 0; i < employees.length; i += FETCH_BATCH_SIZE) {
            if (abortRef.current) throw new Error("Process stopped by user.");
            const batchEmployees = employees.slice(i, i + FETCH_BATCH_SIZE);
            const promises = batchEmployees.map((emp) =>
              fetchLeaveAccounts(emp.id, undefined, undefined).then(
                (accounts) => ({ emp, accounts }),
              ),
            );
            const results = await Promise.all(promises);
            allAccountsWithEmployeeInfo.push(...results);
            await new Promise((resolve) => setTimeout(resolve, 125));
            const completed = Math.min(i + FETCH_BATCH_SIZE, employees.length);
            setProgress(10 + Math.round((completed / employees.length) * 30));
          }
        } else {
          setProgress(40);
        }

        setProgress(50);

        const s1 = downloadDateFormat === "US" ? "06/05/2026" : "05/06/2026";
        const s2 = downloadDateFormat === "US" ? "06/10/2026" : "10/06/2026";

        // Sheet 1: Leave Requests
        const wsSingleData = [
          {
            Employee: "John Doe",
            "Salary ID": "123456",
            Date: s1,
            Account: "Leave Account (A)",
            Cost: 1,
            Unit: "days",
            Comment: "Taking a day off",
            Status: "Requested",
          },
          {
            Employee: "Jane Doe",
            "Salary ID": "654321",
            Date: s2,
            Account: "Leave Account (B)",
            Cost: 7.5,
            Unit: "hours",
            Comment: "Doctor appointment",
            Status: "Requested",
          },
        ];

        // Sheet 2: Instructions
        const wsInstructionsData = [
          { Instruction: "Welcome to Planday Bulk Leave Requests." },
          {
            Instruction:
              "Leave requests must be entered as individual dates, not ranges, to ensure accurate balance deductions and correctly account for non-working days. If your export data uses both a Start and End date for a single day off, select only the Start date.",
          },
          {
            Instruction:
              "Ensure date format is matching your system format (e.g., YYYY-MM-DD or DD/MM/YYYY).",
          },
          {
            Instruction:
              "The 'Account' column should match the name of the leave account.",
          },
          {
            Instruction:
              "The 'Unit' column is the billing unit type for the request (e.g., 'days', 'hours').",
          },
          {
            Instruction:
              "The 'Status' column accepts the following values: 'Requested', 'Approved', 'Denied'.",
          },
          ...(includeEmployeeAccounts
            ? [
                {
                  Instruction:
                    "Use the 'Leave Accounts' sheet to find available accounts for your filtered employees.",
                },
              ]
            : []),
          {
            Instruction:
              "NOTE: You MUST save the file as XLSX. Do NOT upload an empty sheet.",
          },
        ];

        const wb = XLSX.utils.book_new();

        const wsSingle = XLSX.utils.json_to_sheet(wsSingleData);
        const wsInstructions = XLSX.utils.json_to_sheet(wsInstructionsData);

        const styleHeader = (ws: any, jsonCount: number) => {
          if (jsonCount === 0) return;
          const range = XLSX.utils.decode_range(ws["!ref"] as string);
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = { c: C, r: 0 };
            const cellRef = XLSX.utils.encode_cell(cellAddress);
            if (!ws[cellRef]) continue;
            ws[cellRef].s = {
              fill: { fgColor: { rgb: "000080" } },
              font: { color: { rgb: "FFFFFF" }, bold: true },
            };
          }
        };

        styleHeader(wsSingle, wsSingleData.length);
        styleHeader(wsInstructions, wsInstructionsData.length);

        wsSingle["!cols"] = [
          { wch: 20 },
          { wch: 15 },
          { wch: 12 },
          { wch: 20 },
          { wch: 10 },
          { wch: 15 },
          { wch: 30 },
          { wch: 10 },
        ];
        wsInstructions["!cols"] = [{ wch: 100 }];

        XLSX.utils.book_append_sheet(wb, wsSingle, "Leave Requests");

        if (includeEmployeeAccounts) {
          const wsAccountsData: any[] = [];
          allAccountsWithEmployeeInfo.forEach(({ emp, accounts }) => {
            accounts.forEach((acc: any) => {
              wsAccountsData.push({
                "Full Name": `${emp.firstName} ${emp.lastName}`,
                "Salary ID": emp.salaryIdentifier || "",
                "Leave Account Name": acc.name,
                "Unit": getExpectedUnit(accountTypes.find((t) => t.id === acc.typeId)),
                "Validity Start Date": acc.validityPeriod?.start || "",
                "Validity End Date": acc.validityPeriod?.end || "",
                "Account ID": acc.id,
              });
            });
          });
          const wsAccounts = XLSX.utils.json_to_sheet(wsAccountsData);
          styleHeader(wsAccounts, wsAccountsData.length);
          wsAccounts["!cols"] = [
            { wch: 25 },
            { wch: 15 },
            { wch: 30 },
            { wch: 10 },
            { wch: 20 },
            { wch: 20 },
            { wch: 15 },
          ];
          XLSX.utils.book_append_sheet(wb, wsAccounts, "Leave Accounts");
        }

        XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");

        XLSX.writeFile(wb, `Planday_Leave_Requests_${getTodayYYYYMMDD()}.xlsx`);

        setProgress(100);
        setCurrentStep("upload");
      } else {
        setLoadingText("Fetching accounts...");
        const allAccountsWithEmployeeInfo: any[] = [];
        for (let i = 0; i < employees.length; i += FETCH_BATCH_SIZE) {
          if (abortRef.current) throw new Error("Process stopped by user.");
          const batchEmployees = employees.slice(i, i + FETCH_BATCH_SIZE);
          const promises = batchEmployees.map((emp) =>
            fetchLeaveAccounts(emp.id, undefined, undefined).then(
              (accounts) => ({ emp, accounts }),
            ),
          );
          const results = await Promise.all(promises);
          allAccountsWithEmployeeInfo.push(...results);
          await new Promise((resolve) => setTimeout(resolve, 125));
          const completed = Math.min(i + FETCH_BATCH_SIZE, employees.length);
          setProgress(10 + Math.round((completed / employees.length) * 30));
        }

        setProgress(42);
        const filteredAccountsList: any[] = [];
        allAccountsWithEmployeeInfo.forEach(({ emp, accounts }) => {
          const filtered = accounts.filter((acc: any) =>
            updateMethod === "migrate"
              ? acc.typeId === migrateFromAccountId ||
                acc.typeId === migrateToAccountId
              : selectedTypeIds.has(acc.typeId),
          );
          filtered.forEach((acc: any) => {
            filteredAccountsList.push({ accountId: acc.id, emp, acc });
          });
        });
        setProgress(45);

        if (filteredAccountsList.length === 0) {
          setFetchedTemplateData([]);
          throw new Error(
            "No leave accounts found matching the selected criteria.",
          );
        }

        const allTemplateRows: any[] = [];
        setLoadingText("Generating rows...");
        filteredAccountsList.forEach(({ emp, acc }) => {
          let requestStart = getTodayYYYYMMDD();
          let requestEnd = getTodayYYYYMMDD();

          if (updateMethod === "migrate") {
            if (migratePeriodMode === "custom" && migrateDateRange.start && migrateDateRange.end) {
              requestStart = migrateDateRange.start;
              requestEnd = migrateDateRange.end;
            } else if (migratePeriodMode === "full" && acc.validityPeriod) {
              if (acc.validityPeriod.start) requestStart = acc.validityPeriod.start.split("T")[0];
              if (acc.validityPeriod.end) requestEnd = acc.validityPeriod.end.split("T")[0];
            }
          }

          allTemplateRows.push({
            employeeId: emp.id,
            salaryIdentifier: emp.salaryIdentifier || null,
            employeeName: `${emp.firstName} ${emp.lastName}`,
            accountId: acc.id,
            accountTypeId: acc.typeId,
            accountName: acc.name,
            accountTypeCategory: getAccountCategory(acc.typeId, accountTypes),
            cost: 0,
            billingMode: (() => {
              const typeDef = accountTypes.find((t) => t.id === acc.typeId);
              return getExpectedUnit(typeDef);
            })(),
            comment: "",
            date: requestStart,
            start: requestStart,
            end: requestEnd,
          });
        });
        setProgress(90);

        setLoadingText("Preparing editor...");
        const editorRows: any[] = allTemplateRows.map((row) => ({
          id: crypto.randomUUID(),
          employeeId: row.employeeId,
          salaryIdentifier: row.salaryIdentifier,
          employeeName: row.employeeName,
          accountId: row.accountId,
          accountTypeId: row.accountTypeId,
          accountName: row.accountName,
          accountTypeCategory: row.accountTypeCategory,
          date: row.date,
          start: row.start,
          end: row.end,
          cost: 0,
          billingMode: row.billingMode,
          comment: "",
          status: "pending",
        }));
        clearAdjustmentsHistory(editorRows);
        resetReviewSessionState(editorRows);
        setProgress(100);
        setCurrentStep("review");
      }
    } catch (err: any) {
      handleApiError(err);
      console.error(err);
    } finally {
      setIsLoading((prev) => ({ ...prev, template: false }));
      setHasAttemptedSubmit(false);
    }
  };
  const processUploadedFile = (file: File, formatOverride?: "EU" | "US") => {
    setError(null);
    setUploadConflicts(null);
    setUploadValidityErrors(null);
    setLastUploadedFile(file);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        // We should prioritize "Leave Requests"
        let worksheet = workbook.Sheets["Leave Requests"];
        if (!worksheet) worksheet = workbook.Sheets[workbook.SheetNames[0]];

        const json: any[] = XLSX.utils.sheet_to_json(worksheet, { raw: true });

        if (updateMethod === "migrate" && json.length > 0) {
            // Check for specific template columns
            const headers = Object.keys(json[0]).map(k => k.trim());
            const requiredHeaders = ["Date", "Salary ID", "Employee", "Tax ID", "Account", "Cost", "Billing mode", "Status"];
            const missingHeaders = requiredHeaders.filter(h => !headers.some(header => header.toLowerCase() === h.toLowerCase()));
            
            if (missingHeaders.length > 0) {
                setError(`Invalid template structure. Missing columns: ${missingHeaders.join(", ")}. Please review your file and ensure the columns are: Date, Salary ID, Employee, Tax ID, Account, Cost, Billing mode, Status. Reminder: you should use 'Sheet 2' of the leave request export file (either delete Sheet 1 or move Sheet 2 as the first sheet).`);
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
        } else if (updateMethod === "migrate" && json.length === 0) {
            setError("The uploaded file appears to be empty. Please ensure you are using 'Sheet 2' of the leave request export file.");
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        setIsLoading((prev) => ({ ...prev, template: true }));
        setLoadingText("Processing upload and resolving accounts...");

        const employeeCache = new Map();
        for (const row of json) {
          const salId = String(row["Salary ID"] || "");
          const empName = String(row["Employee"] || "");
          let emp = null;
          if (salId)
            emp = allEmployees.find((e) => e.salaryIdentifier === salId);
          if (!emp)
            emp = allEmployees.find(
              (e) =>
                `${e.firstName} ${e.lastName}`.toLowerCase() ===
                empName.trim().toLowerCase(),
            );
          if (emp && !employeeCache.has(emp.id)) {
            try {
              const accounts = await fetchLeaveAccounts(
                emp.id,
                undefined,
                undefined,
              );
              employeeCache.set(emp.id, { emp, accounts });
            } catch (e) {
              console.error("Failed to fetch accounts for", emp.id, e);
            }
          }
        }

        setIsLoading((prev) => ({ ...prev, template: false }));

        const parseExcelDate = (input: any): string | null => {
          if (input == null) return null;

          if (input instanceof Date) {
            if (isNaN(input.getTime())) return null;

            // Always use local methods!
            const y = input.getFullYear();
            const m = String(input.getMonth() + 1).padStart(2, "0");
            const d = String(input.getDate()).padStart(2, "0");

            return `${y}-${m}-${d}`;
          }

          if (typeof input === "number" || /^\d{5}$/.test(String(input))) {
            const serial = parseInt(String(input), 10);
            if (serial > 20000 && serial < 80000) {
              // Valid bounds for recent dates
              // 25569 is the difference in days between Jan 1 1900 and Jan 1 1970
              const dateObj = new Date(
                Math.round((serial - 25569) * 86400 * 1000),
              );

              // Use UTC methods here because we calculated pure absolute time from the Unix Epoch
              const y = dateObj.getUTCFullYear();
              const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
              const d = String(dateObj.getUTCDate()).padStart(2, "0");

              return `${y}-${m}-${d}`;
            }
          }

          if (typeof input === "string") {
            const str = input.trim();
            if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;

            // Assuming DD/MM/YYYY or DD/MM/YY
            const parts = str.match(
              /(^|\b)(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2}|\d{4})\b/,
            );
            if (parts) {
              let day = parseInt(parts[2], 10);
              let month = parseInt(parts[3], 10);
              let year = parseInt(parts[4], 10);

              if (year < 100) year += 2000;

              // Return standard structure
              return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            }
          }
          return null;
        };

        const reviews = json.map((row, idx): any => {
          const startRaw = row["Start"] || row["Date"];
          const endRaw = row["End"] || row["Date"] || startRaw;
          let startDate = parseExcelDate(startRaw);
          let endDate = parseExcelDate(endRaw);

          let accountId = null;
          let accountTypeId = null;
          const accountNameStr = String(row["Account"] || "").trim();

          const normalizeName = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();
          const normalizedAccountNameStr = normalizeName(accountNameStr);

          const matchedType = accountTypes.find(
            (t) => normalizeName(t.name) === normalizedAccountNameStr,
          );

          const salId = String(row["Salary ID"] || "");
          const empName = String(row["Employee"] || "");
          let emp = null;
          let employeeMatchType = "none";

          if (salId) {
            const empBySalId = allEmployees.find((e) => e.salaryIdentifier === salId);
            if (empBySalId) {
              if (
                normalizeName(`${empBySalId.firstName} ${empBySalId.lastName}`) ===
                normalizeName(empName)
              ) {
                employeeMatchType = "exact";
              } else {
                employeeMatchType = "salary";
              }
              emp = empBySalId;
            }
          }
          if (!emp) {
            emp = allEmployees.find(
              (e) =>
                normalizeName(`${e.firstName} ${e.lastName}`) ===
                normalizeName(empName),
            );
            if (emp) {
              employeeMatchType = "name";
            }
          }

          if (updateMethod === "migrate" && migrateFromAccountId) {
            if (!matchedType || matchedType.id !== migrateFromAccountId) {
              return null; // Ignore rows that don't match the "from" account type
            }
            if (migratePeriodMode === "custom" && migrateDateRange.start && migrateDateRange.end && startDate) {
              const rStart = new Date(startDate);
              const customStart = new Date(migrateDateRange.start);
              const customEnd = new Date(migrateDateRange.end);
              customEnd.setHours(23, 59, 59, 999);
              if (rStart < customStart || rStart > customEnd) {
                return null;
              }
            }
          }

          if (emp && employeeCache.has(emp.id)) {
            const cache = employeeCache.get(emp.id);
            const targetTypeId = updateMethod === "migrate" ? migrateToAccountId : (matchedType?.id || null);

            const matchAcc = cache.accounts.find((a: any) => {
              let isTypeMatch = false;
              if (targetTypeId && (a.typeId === targetTypeId || a.accountType?.id === targetTypeId)) {
                isTypeMatch = true;
              }
              if (!isTypeMatch && updateMethod !== "migrate") {
                if (a.name && normalizeName(a.name) === normalizedAccountNameStr) {
                  isTypeMatch = true;
                }
                if (!isTypeMatch && a.accountType?.name && normalizeName(a.accountType.name) === normalizedAccountNameStr) {
                  isTypeMatch = true;
                }
              }
              
              if (!isTypeMatch) return false;

              if (startDate && a.validityPeriod) {
                const rStart = new Date(startDate);
                // Prefer spendingPeriod if available, fallback to validityPeriod
                const periodToUse = a.spendingPeriod || a.validityPeriod;
                const vStart = periodToUse.start
                  ? new Date(periodToUse.start)
                  : new Date(0);
                const vEnd = periodToUse.end
                  ? new Date(periodToUse.end)
                  : new Date(8640000000000000);
                return rStart >= vStart && rStart <= vEnd;
              }
              return true;
            });
            if (matchAcc) {
              accountId = matchAcc.id;
              accountTypeId = matchAcc.typeId || matchAcc.accountType?.id;
              if (matchAcc.validityPeriod)
                row.validityPeriod = matchAcc.validityPeriod;
              if (matchAcc.spendingPeriod)
                row.spendingPeriod = matchAcc.spendingPeriod;
              row.accountStatus = matchAcc.status;
            }
          }

          let costValue = row["Cost"];
          let cost = parseFloat(costValue);
          if (!isNaN(cost)) {
            cost = Math.abs(cost);
          }

          let billingModeError: string | undefined = undefined;
          let billingMode = String(row["Unit"] || row["Billing mode"] || "");
          
          if (billingMode.toLowerCase() === "hour") billingMode = "hours";
          if (billingMode.toLowerCase() === "day") billingMode = "days";

          if (accountId) {
            const salId = String(row["Salary ID"] || "");
            const empName = String(row["Employee"] || "");
            let emp = null;
            if (salId)
              emp = allEmployees.find((e) => e.salaryIdentifier === salId);
            if (!emp)
              emp = allEmployees.find(
                (e) =>
                  `${e.firstName} ${e.lastName}`.toLowerCase() ===
                  empName.trim().toLowerCase(),
              );

            if (emp && employeeCache.has(emp.id)) {
              const cache = employeeCache.get(emp.id);
              // Find the individual employee leave account
              const empAcc = cache.accounts.find(
                (a: any) => a.id === accountId,
              );
              if (empAcc) {
                // Find the Global Leave account type for its unit
                const typeDef = accountTypes.find(
                  (t) => t.id === empAcc.typeId,
                );
                const expectedUnit = getExpectedUnit(typeDef);
                if (expectedUnit) {
                  if (billingMode && billingMode.toLowerCase() !== expectedUnit.toLowerCase()) {
                    if (updateMethod === "migrate") {
                      const fromU = billingMode.toLowerCase();
                      const toU = expectedUnit.toLowerCase();
                      if (fromU === "days" && toU === "hours") {
                        if (!isNaN(cost)) {
                          cost = Number((cost * migrateDaysToHoursRatio).toFixed(2));
                          billingModeError = `Converted from Days to Hours (ratio 1:${migrateDaysToHoursRatio})`;
                        }
                      } else if (fromU === "hours" && toU === "days") {
                        if (!isNaN(cost)) {
                          cost = cost > 0 ? 1 : 0;
                          billingModeError = `Converted from Hours to Days (non-zero hours counted as 1 day)`;
                        }
                      } else {
                        billingModeError = `Template unit is '${billingMode}'. Account expected '${expectedUnit}'. Auto-converted.`;
                      }
                    } else {
                      billingModeError = `Template unit is '${billingMode}'. Account expected '${expectedUnit}'. Auto-converted.`;
                    }
                  }
                  billingMode = expectedUnit;
                }
              }
            }
          }

          let costError: string | undefined = undefined;

          if (
            costValue === undefined ||
            costValue === null ||
            costValue === ""
          ) {
            costError = "Cost is required";
            cost = NaN;
          } else if (isNaN(cost)) {
            costError = "Cost must be a valid number";
          } else if (billingMode.toLowerCase() === "days" && cost > 1) {
            costError = "Cost cannot exceed 1 day";
          } else if (billingMode.toLowerCase() === "hours" && cost > 24) {
            costError = "Cost cannot exceed 24 hours";
          }

          const validationErrors = [];
          if (!emp) validationErrors.push("Employee Not Found");
          if (!startDate) validationErrors.push("Missing Date");
          if (!accountId) {
             if (updateMethod === "migrate") {
                validationErrors.push("Destination Account Not Found");
             } else {
                validationErrors.push("Account Not Found");
             }
          }
          if (costError) validationErrors.push(costError);

          const errorMessage =
            validationErrors.length > 0
              ? validationErrors.join(" | ")
              : undefined;

          let portalEmployeeName = undefined;
          let portalSalaryIdentifier = undefined;
          if (emp) {
            portalEmployeeName = `${emp.firstName} ${emp.lastName}`.trim();
            portalSalaryIdentifier = emp.salaryIdentifier;
          }

          return {
            id: `adj-${idx}-${Date.now()}`,
            employeeId: emp ? emp.id : undefined,
            employeeName: row["Employee"] || "Unknown",
            portalEmployeeName,
            employeeMatchType,
            salaryIdentifier: row["Salary ID"] || null,
            portalSalaryIdentifier,
            accountId: accountId || 0,
            accountTypeId: accountTypeId,
            accountStatus: row.accountStatus,
            validityPeriod: row.validityPeriod,
            spendingPeriod: row.spendingPeriod,
            accountName: String(row["Account"] || "Unknown"),
            originalAccountName: String(row["Account"] || "Unknown"),
            date: startDate,
            start: startDate,
            end: endDate,
            cost: cost,
            billingMode: billingMode,
            requestStatus: (() => {
              const s = String(row["Status"] || "Requested").toLowerCase();
              if (s === "approved") return "Approved";
              if (s === "denied") return "Denied";
              return "Requested";
            })(),
            comment: String(row["Comment"] || row["Note"] || row["note"] || ""),
            status: "pending",
            error: errorMessage,
            billingModeError,
            isValidationError: validationErrors.length > 0,
          };
        }).filter(Boolean); // Filter out rows that were ignored (e.g. migrate mismatch)

        if (reviews.length === 0) {
          setError("No valid requests found in the file.");
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          clearAdjustmentsHistory(reviews);
          resetReviewSessionState(reviews);
          setCurrentStep("review");
        }
      } catch (err: any) {
        console.error(err);
        handleApiError(
          new Error(
            "Failed to parse the uploaded file. Please check the date formats and try again.",
          ),
        );
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSwitchDateFormat = () => {
    if (!lastUploadedFile) return;
    const newFormat = downloadDateFormat === "EU" ? "US" : "EU";
    setDownloadDateFormat(newFormat);
    // Re-process with new format override immediately
    processUploadedFile(lastUploadedFile, newFormat);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileInput = e.target;
    const file = fileInput.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
    fileInput.value = "";
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleUpdateEffectiveDate = (id: string, newDate: string) => {
    setAdjustmentsToReview((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, effectiveDate: newDate };
          return updated;
        }
        return item;
      }),
    );
  };

  const handleUpdateAdjustment = (id: string, newAdjustment: number) => {
    setAdjustmentsToReview((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          let updatedNewBalance = item.newBalance;
          if (
            typeof item.availableBalance === "number" &&
            !isNaN(item.availableBalance)
          ) {
            updatedNewBalance = Number(
              (item.availableBalance + newAdjustment).toFixed(2),
            );
          }
          return {
            ...item,
            adjustment: newAdjustment,
            newBalance: updatedNewBalance,
          };
        }
        return item;
      }),
    );
  };

  const handleUpdateNewBalance = (id: string, finalNewBalance: number) => {
    setAdjustmentsToReview((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          let derivedAdjustment = item.adjustment;
          if (
            typeof item.availableBalance === "number" &&
            !isNaN(item.availableBalance)
          ) {
            // newBalance = availableBalance + adjustment  => adjustment = newBalance - availableBalance
            derivedAdjustment = Number(
              (finalNewBalance - item.availableBalance).toFixed(2),
            );
          }
          return {
            ...item,
            adjustment: derivedAdjustment,
            newBalance: finalNewBalance,
          };
        }
        return item;
      }),
    );
  };

  const handleStatusChange = (id: string, newStatus: string) => {
    setAdjustmentsToReview((prev) => {
      const newReviews = [...prev];
      const idx = newReviews.findIndex((r) => r.id === id);
      if (idx === -1) return prev;
      const target = newReviews[idx];

      // Find the chunk for this target
      const sameGroup = newReviews.filter(
        (r) =>
          r.employeeName === target.employeeName &&
          r.accountId === target.accountId &&
          r.billingMode === target.billingMode &&
          r.requestStatus === target.requestStatus,
      );

      const parseDate = (dstr: string) => {
        if (!dstr) return new Date(0);
        const [y, m, d] = dstr.split("-").map(Number);
        return new Date(y, m - 1, d);
      };
      sameGroup.sort((a, b) => (a.start || "").localeCompare(b.start || ""));

      let targetChunk = [target]; // Fallback
      if (sameGroup.length > 0) {
        let currentChunk = [sameGroup[0]];
        let chunks = [currentChunk];
        for (let i = 1; i < sameGroup.length; i++) {
          const curr = sameGroup[i];
          const prevRow = currentChunk[currentChunk.length - 1];
          const currDate = parseDate(curr.start);
          const prevDate = parseDate(prevRow.start);
          const diffTime = Math.abs(currDate.getTime() - prevDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            currentChunk.push(curr);
          } else {
            currentChunk = [curr];
            chunks.push(currentChunk);
          }
        }
        const myChunk = chunks.find((c) => c.some((r) => r.id === id));
        if (myChunk) targetChunk = myChunk;
      }

      const chunkIds = new Set(targetChunk.map((r) => r.id));
      return newReviews.map((r) => {
        if (chunkIds.has(r.id)) {
          return validateReviewItem(
            { ...r, requestStatus: newStatus },
            accountTypes,
          ) as any;
        }
        return r;
      });
    });
  };

  const handleUpdateComment = (id: string, newComment: string) => {
    setAdjustmentsToReview((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return { ...item, comment: newComment };
        }
        return item;
      }),
    );
  };

  const handleUpdateBalances = async () => {
    setIsUpdatingBalances(true);
    setShowUpdateBalanceModal(false);
    setLoadingText("Updating available balances...");
    setProgress(0);
    abortRef.current = false;

    try {
      const updatedAdjustments = [...adjustmentsToReview];
      const FETCH_BATCH_SIZE = 50;

      for (let i = 0; i < updatedAdjustments.length; i += FETCH_BATCH_SIZE) {
        if (abortRef.current) break;

        const batch = updatedAdjustments.slice(i, i + FETCH_BATCH_SIZE);
        const promises = batch.map(async (item) => {
          if (item.balanceDate && item.accountId) {
            try {
              let queryDate = item.balanceDate || "";
              if (queryDate.includes("/")) {
                const parts = queryDate.split("/");
                if (downloadDateFormat === "EU") {
                  queryDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
                } else {
                  queryDate = `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
                }
              }

              if (!/^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
                if (singleBalanceDate) queryDate = singleBalanceDate;
                else return item;
              }

              const balanceData = await fetchAccountBalance(
                item.accountId,
                queryDate,
              );

              let newAvail = balanceData.balance;
              let newAdj = item.adjustment;

              if (
                typeof item.newBalance === "number" &&
                !isNaN(item.newBalance)
              ) {
                newAdj = Number((item.newBalance - newAvail).toFixed(2));
              } else if (
                typeof item.newBalance === "string" &&
                item.newBalance !== ""
              ) {
                const nbParsed = parseFloat(item.newBalance);
                if (!isNaN(nbParsed)) {
                  newAdj = Number((nbParsed - newAvail).toFixed(2));
                }
              }

              return {
                ...item,
                availableBalance: newAvail,
                adjustment: newAdj,
              };
            } catch (err) {
              console.error(
                "Failed to fetch balance for account",
                item.accountId,
                err,
              );
              return item;
            }
          }
          return item;
        });

        const batchResults = await Promise.all(promises);

        batchResults.forEach((result, idx) => {
          updatedAdjustments[i + idx] = result;
        });

        const pct = Math.round(
          ((i + batch.length) / updatedAdjustments.length) * 100,
        );
        setProgress(pct);
        await new Promise((r) => setTimeout(r, 125));
      }

      if (!abortRef.current) {
        setAdjustmentsToReview(updatedAdjustments);
      }
    } catch (err) {
      console.error("Error updating balances", err);
      handleApiError(new Error("Failed to update available balances."));
    } finally {
      setIsUpdatingBalances(false);
      setProgress(0);
    }
  };

  // New Handlers for Bulk Date Updates
  const handleBulkSetToStart = () => {
    setAdjustmentsToReview((prev) =>
      prev.map((item) => {
        if (item.validFrom) {
          return { ...item, effectiveDate: item.validFrom };
        }
        return item;
      }),
    );
  };

  const handleBulkSetToToday = () => {
    const today = getTodayYYYYMMDD();
    setAdjustmentsToReview((prev) =>
      prev.map((item) => {
        return { ...item, effectiveDate: today };
      }),
    );
  };

  const handleBulkSetToCustomDate = () => {
    if (!bulkCustomDate) return;
    setAdjustmentsToReview((prev) =>
      prev.map((item) => {
        return { ...item, effectiveDate: bulkCustomDate };
      }),
    );
  };

  // --- SORT & DELETE HANDLERS ---

  const handleSort = (key: keyof AdjustmentReview | "status" | "validity") => {
    setSortConfig((current) => {
      if (current && current.key === key) {
        return { key, direction: current.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  };

  const handleDeleteRow = (id: string) => {
    setAdjustmentsToReview((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSelectAllErrors = () => {
    const errorIds = new Set<string>();
    adjustmentsToReview.forEach((item) => {
      if (item.isValidationError || !item.date) {
        errorIds.add(item.id);
      }
    });
    setSelectedReviewIds((prev) => {
      const newSet = new Set(prev);
      errorIds.forEach((id) => newSet.add(id));
      return newSet;
    });
  };

  const toggleErrorFilter = () => {
    if (errorFilterRowIds !== null) {
      setErrorFilterRowIds(null);
    } else {
      const groupings = new Map<string, any[]>();
      adjustmentsToReview.forEach((item) => {
        const requestStatus = item.requestStatus || "Requested";
        const key = `${item.employeeName}_${item.accountId}_${item.billingMode}_${requestStatus}`;
        if (!groupings.has(key)) groupings.set(key, []);
        groupings.get(key)!.push(item);
      });

      const rowIdsWithErrors = new Set<string>();

      groupings.forEach((rows) => {
        const parseDate = (dstr: string) => {
          if (!dstr) return new Date(0);
          const [y, m, d] = dstr.split("-").map(Number);
          return new Date(y, m - 1, d);
        };

        rows.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

        if (rows.length === 0) return;

        let currentChunk = [rows[0]];
        let chunks = [currentChunk];

        for (let i = 1; i < rows.length; i++) {
          const curr = rows[i];
          const prev = currentChunk[currentChunk.length - 1];
          const currDateStr = curr.date;
          const prevDateStr = prev.date;

          if (!currDateStr || !prevDateStr) {
            // Missing date row: just put it in its own chunk or keep going.
            // To be safe and capture it, we'll put it in its own chunk.
            currentChunk = [curr];
            chunks.push(currentChunk);
            continue;
          }

          const currDate = parseDate(currDateStr);
          const prevDate = parseDate(prevDateStr);

          const diffTime = Math.abs(currDate.getTime() - prevDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays === 1) {
            currentChunk.push(curr);
          } else {
            currentChunk = [curr];
            chunks.push(currentChunk);
          }
        }

        chunks.forEach((chunk) => {
          const hasError = chunk.some((a) => a.isValidationError || !a.date);
          if (hasError) {
            chunk.forEach((a) => rowIdsWithErrors.add(a.id));
          }
        });
      });

      setErrorFilterRowIds(rowIdsWithErrors);
    }
  };

  const handleRemoveSelected = () => {
    if (selectedReviewIds.size === 0) return;
    setShowRemoveConfirmModal(true);
  };

  const confirmRemoveSelected = () => {
    setAdjustmentsToReview((prev) =>
      prev.filter((item) => !selectedReviewIds.has(item.id)),
    );
    setSelectedReviewIds(new Set());
    setShowRemoveConfirmModal(false);
  };

  const handleClearSelection = () => {
    setSelectedReviewIds(new Set());
  };

  const uniqueAccountNames = useMemo(() => {
    const names = new Set<string>();
    adjustmentsToReview.forEach((r) => names.add(r.accountName));
    return Array.from(names)
      .filter(Boolean)
      .map((name) => ({ id: name, name }));
  }, [adjustmentsToReview]);

  const sortedReviews = useMemo(() => {
    let filteredReviews = adjustmentsToReview;

    if (errorFilterRowIds !== null) {
      filteredReviews = filteredReviews.filter((item) => {
        return errorFilterRowIds.has(item.id);
      });
    }

    // Filter by Review Dropdowns
    if (
      reviewDepartmentIds.size > 0 ||
      reviewEmployeeGroupIds.size > 0 ||
      reviewEmployeeTypeIds.size > 0 ||
      reviewLeaveAccountNames.size > 0
    ) {
      filteredReviews = filteredReviews.filter((item) => {
        // Determine whether this item matches dropdowns using its employeeId mapping
        const emp = item.employeeId
          ? allEmployees.find((e) => e.id === item.employeeId)
          : undefined;

        let matches = true;

        if (reviewDepartmentIds.size < departments.length) {
          let empMatchesDept = false;
          if (usePrimaryDepartmentOnly) {
            if (
              emp?.primaryDepartmentId !== undefined &&
              emp?.primaryDepartmentId !== null
            ) {
              empMatchesDept = reviewDepartmentIds.has(
                String(emp.primaryDepartmentId),
              );
            }
          } else {
            if (emp?.departments && emp.departments.length > 0) {
              empMatchesDept = emp.departments.some((d: any) =>
                reviewDepartmentIds.has(
                  String(typeof d === "object" ? d.id : d),
                ),
              );
            } else if (emp?.departmentId) {
              empMatchesDept = reviewDepartmentIds.has(
                String(emp.departmentId),
              );
            }
          }
          if (!empMatchesDept) matches = false;
        }

        if (matches && reviewEmployeeGroupIds.size < employeeGroups.length) {
          let empMatchesGroup = false;
          if (emp?.employeeGroups && emp.employeeGroups.length > 0) {
            empMatchesGroup = emp.employeeGroups.some((g: any) =>
              reviewEmployeeGroupIds.has(
                String(typeof g === "object" ? g.id : g),
              ),
            );
          } else if (emp?.employeeGroupIds && emp.employeeGroupIds.length > 0) {
            empMatchesGroup = emp.employeeGroupIds.some((g) =>
              reviewEmployeeGroupIds.has(String(g)),
            );
          } else if (emp?.employeeGroupId) {
            empMatchesGroup = reviewEmployeeGroupIds.has(
              String(emp.employeeGroupId),
            );
          }
          if (!empMatchesGroup) matches = false;
        }

        if (matches && reviewEmployeeTypeIds.size < employeeTypes.length) {
          let empMatchesType = false;
          if (emp?.employeeType !== undefined && emp?.employeeType !== null) {
            empMatchesType = reviewEmployeeTypeIds.has(
              String(
                typeof emp.employeeType === "object"
                  ? emp.employeeType.id
                  : emp.employeeType,
              ),
            );
          } else if (
            emp?.employeeTypeId !== undefined &&
            emp?.employeeTypeId !== null
          ) {
            empMatchesType = reviewEmployeeTypeIds.has(
              String(emp.employeeTypeId),
            );
          }
          if (!empMatchesType) matches = false;
        }

        if (
          matches &&
          reviewLeaveAccountNames.size < uniqueAccountNames.length
        ) {
          if (!reviewLeaveAccountNames.has(item.accountName)) {
            matches = false;
          }
        }

        return matches;
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filteredReviews = filteredReviews.filter((item) =>
        item.employeeName.toLowerCase().includes(q),
      );
    }

    // First group by Employee/Account
    const groupings = new Map<string, AdjustmentReview[]>();
    filteredReviews.forEach((item) => {
      const requestStatus = item.requestStatus || "Requested";
      const key = `${item.employeeName}-${item.accountId}-${item.billingMode}-${requestStatus}`;
      if (!groupings.has(key)) groupings.set(key, []);
      groupings.get(key)!.push(item);
    });

    // Split each grouping into chunks of contiguous dates
    const sortedBundles: AdjustmentReview[][] = [];

    groupings.forEach((group) => {
      if (group.length === 0) return;
      group.sort((a, b) => {
        const dateA = a.date || a.start || "";
        const dateB = b.date || b.start || "";
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.localeCompare(dateB);
      });

      const parseDate = (dstr: string) => {
        if (!dstr) return new Date(0);
        const [y, m, d] = dstr.split("-").map(Number);
        return new Date(y, m - 1, d);
      };

      let currentChunk = [group[0]];
      sortedBundles.push(currentChunk);

      for (let i = 1; i < group.length; i++) {
        const curr = group[i];
        const prev = currentChunk[currentChunk.length - 1];

        const currDateStr = curr.date || curr.start || "";
        const prevDateStr = prev.date || prev.start || "";

        if (!currDateStr || !prevDateStr) {
          currentChunk = [curr];
          sortedBundles.push(currentChunk);
          continue;
        }

        const currDate = parseDate(currDateStr);
        const prevDate = parseDate(prevDateStr);

        const diffTime = Math.abs(currDate.getTime() - prevDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          currentChunk.push(curr);
        } else {
          currentChunk = [curr];
          sortedBundles.push(currentChunk);
        }
      }
    });

    if (sortConfig) {
      sortedBundles.sort((bundleA, bundleB) => {
        const a = bundleA[0];
        const b = bundleB[0];

        let valA: any = a[sortConfig.key as keyof AdjustmentReview];
        let valB: any = b[sortConfig.key as keyof AdjustmentReview];

        if (sortConfig.key === "status") {
          const getErrorScore = (item: AdjustmentReview) =>
            item.isValidationError || !item.date || !item.start ? 0 : 1;
          const bundleScoreA = Math.min(...bundleA.map(getErrorScore));
          const bundleScoreB = Math.min(...bundleB.map(getErrorScore));
          valA = bundleScoreA;
          valB = bundleScoreB;
        } else if (sortConfig.key === "date") {
          valA = a.date || a.start || "";
          valB = b.date || b.start || "";
        } else if (sortConfig.key === "employeeName") {
          valA = (a.employeeName || "").toLowerCase();
          valB = (b.employeeName || "").toLowerCase();
        } else if (sortConfig.key === "accountName") {
          valA = (a.accountName || "").toLowerCase();
          valB = (b.accountName || "").toLowerCase();
        } else if (sortConfig.key === "employeeMatchType") {
          const matchScore = { exact: 1, salary: 2, name: 3, none: 4 };
          const getMatchScore = (item: AdjustmentReview) => matchScore[item.employeeMatchType as keyof typeof matchScore] || 5;
          valA = Math.min(...bundleA.map(getMatchScore));
          valB = Math.min(...bundleB.map(getMatchScore));
        }

        if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
        if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    } else {
      // Default sort: "The default sort is the request with the earliest date is at the top."
      sortedBundles.sort((bundleA, bundleB) => {
        const a = bundleA[0];
        const b = bundleB[0];
        const dateA = a.date || a.start || "";
        const dateB = b.date || b.start || "";
        return dateA.localeCompare(dateB);
      });
    }

    return sortedBundles.flat();
  }, [
    adjustmentsToReview,
    sortConfig,
    searchQuery,
    reviewDepartmentIds,
    reviewEmployeeGroupIds,
    reviewEmployeeTypeIds,
    reviewLeaveAccountNames,
    allEmployees,
    departments.length,
    employeeGroups.length,
    employeeTypes.length,
    usePrimaryDepartmentOnly,
    uniqueAccountNames.length,
    errorFilterRowIds,
  ]);

  useEffect(() => {
    setReviewPage(1);
  }, [
    searchQuery,
    reviewDepartmentIds,
    reviewEmployeeGroupIds,
    reviewEmployeeTypeIds,
    reviewLeaveAccountNames,
    sortConfig,
    adjustmentsToReview.length,
    errorFilterRowIds,
  ]);

  const paginatedReviews = useMemo(() => {
    if (reviewRowsPerPage === "All") return sortedReviews;
    const start = (reviewPage - 1) * reviewRowsPerPage;
    return sortedReviews.slice(start, start + reviewRowsPerPage);
  }, [sortedReviews, reviewPage, reviewRowsPerPage]);

  const reviewBundleCounts = useMemo(() => {
    const getBundleCount = (data: AdjustmentReview[]) => {
      const groupings = new Map<string, AdjustmentReview[]>();
      data.forEach((item) => {
        const requestStatus = item.requestStatus || "Requested";
        const key = `${item.employeeName}-${item.accountId}-${item.billingMode}-${requestStatus}`;
        if (!groupings.has(key)) groupings.set(key, []);
        groupings.get(key)!.push(item);
      });

      let bundleCount = 0;
      groupings.forEach((group) => {
        if (group.length === 0) return;
        group.sort((a, b) => {
          const dateA = a.date || a.start || "";
          const dateB = b.date || b.start || "";
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          return dateA.localeCompare(dateB);
        });

        const parseDate = (dstr: string) => {
          if (!dstr) return new Date(0);
          const [y, m, d] = dstr.split("-").map(Number);
          return new Date(y, m - 1, d);
        };

        let currentChunk = [group[0]];
        bundleCount++;

        for (let i = 1; i < group.length; i++) {
          const curr = group[i];
          const prev = currentChunk[currentChunk.length - 1];

          const currDateStr = curr.date || curr.start || "";
          const prevDateStr = prev.date || prev.start || "";

          if (!currDateStr || !prevDateStr) {
            currentChunk = [curr];
            bundleCount++;
            continue;
          }

          const currDate = parseDate(currDateStr);
          const prevDate = parseDate(prevDateStr);

          const diffTime = Math.abs(currDate.getTime() - prevDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays === 1) {
            currentChunk.push(curr);
          } else {
            currentChunk = [curr];
            bundleCount++;
          }
        }
      });
      return bundleCount;
    };

    return {
      filtered: getBundleCount(sortedReviews),
      total: getBundleCount(adjustmentsToReview),
    };
  }, [sortedReviews, adjustmentsToReview]);

  const bundledRequestsCount = useMemo(() => {
    const groupings = new Map<string, any[]>();
    sortedReviews.forEach((item) => {
      if (item.status === "error" && item.isValidationError) return;
      if (!item.date) return;

      const requestStatus = item.requestStatus || "Requested";
      const key = `${item.employeeName}_${item.accountId}_${item.billingMode}_${requestStatus}`;
      if (!groupings.has(key)) groupings.set(key, []);
      groupings.get(key)!.push(item);
    });

    let count = 0;
    groupings.forEach((rows) => {
      const parseDate = (dstr: string) => {
        const [y, m, d] = dstr.split("-").map(Number);
        return new Date(y, m - 1, d);
      };

      rows.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

      if (rows.length === 0) return;

      let currentChunk = [rows[0]];

      for (let i = 1; i < rows.length; i++) {
        const curr = rows[i];
        const prev = currentChunk[currentChunk.length - 1];
        const currDate = parseDate(curr.date);
        const prevDate = parseDate(prev.date);

        const diffTime = Math.abs(currDate.getTime() - prevDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          currentChunk.push(curr);
        } else {
          currentChunk = [curr];
          count++;
        }
      }
      count++;
    });

    return count;
  }, [sortedReviews]);

  const totalTableErrors = useMemo(() => {
    return adjustmentsToReview.filter((a) => a.isValidationError || !a.date)
      .length;
  }, [adjustmentsToReview]);

  const [bulkEditDateWarning, setBulkEditDateWarning] = useState<{
    skippedflexCount: number;
  } | null>(null);

  const handleApplyBulkEdit = () => {
    if (!bulkEditField || selectedReviewIds.size === 0) return;

    let skippedFlexAccounts = 0;

    if (
      bulkEditField === "effectiveDate" &&
      bulkEditEffectiveDateType === "start_date"
    ) {
      adjustmentsToReview.forEach((item) => {
        if (selectedReviewIds.has(item.id)) {
          if (
            item.accountTypeCategory === "FLEX/TOIL" &&
            (!item.validFrom || item.validFrom === "N/A")
          ) {
            skippedFlexAccounts++;
          }
        }
      });

      if (skippedFlexAccounts > 0) {
        setBulkEditDateWarning({ skippedflexCount: skippedFlexAccounts });
        return; // Stop and wait for user confirmation
      }
    }

    executeApplyBulkEdit();
  };

  const executeApplyBulkEdit = () => {
    setAdjustmentsToReview((prev) =>
      prev.map((item) => {
        if (selectedReviewIds.has(item.id)) {
          if (bulkEditField === "adjustment") {
            const num = parseFloat(bulkEditValueAdjustment);
            if (!isNaN(num)) {
              let updatedNewBalance = item.newBalance;
              if (
                typeof item.availableBalance === "number" &&
                !isNaN(item.availableBalance)
              ) {
                updatedNewBalance = Number(
                  (item.availableBalance + num).toFixed(2),
                );
              }
              return {
                ...item,
                adjustment: num,
                newBalance: updatedNewBalance,
              };
            }
          } else if (bulkEditField === "newBalance") {
            const num = parseFloat(bulkEditValueNewBalance);
            if (!isNaN(num)) {
              let derivedAdjustment = item.adjustment;
              if (
                typeof item.availableBalance === "number" &&
                !isNaN(item.availableBalance)
              ) {
                derivedAdjustment = Number(
                  (num - item.availableBalance).toFixed(2),
                );
              }
              return {
                ...item,
                adjustment: derivedAdjustment,
                newBalance: num,
              };
            }
          } else if (bulkEditField === "effectiveDate") {
            let newDate = bulkEditValueEffectiveDate;
            if (bulkEditEffectiveDateType === "today")
              newDate = getTodayYYYYMMDD();
            if (bulkEditEffectiveDateType === "start_date") {
              if (
                item.accountTypeCategory === "FLEX/TOIL" &&
                (!item.validFrom || item.validFrom === "N/A")
              ) {
                return item; // Skip modifying this item
              }
              newDate =
                item.validFrom && item.validFrom !== "N/A"
                  ? item.validFrom
                  : getTodayYYYYMMDD();
            }
            if (newDate) {
              return { ...item, effectiveDate: newDate };
            }
          } else if (bulkEditField === "comment") {
            return { ...item, comment: bulkEditValueComment };
          }
        }
        return item;
      }),
    );
  };

  const handleSelectFiltered = () => {
    setSelectedReviewIds(new Set(sortedReviews.map((r) => r.id)));
  };

  const handleSelectAll = () => {
    setSelectedReviewIds(new Set(adjustmentsToReview.map((r) => r.id)));
  };

  const toggleReviewSelection = (id: string) => {
    const newSet = new Set(selectedReviewIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedReviewIds(newSet);
  };

  const executeBatchUpdate = async () => {
    abortRef.current = false;
    mixedRequestsDataRef.current = [];
    oldNotesDataRef.current = [];
    deniedRequestsDataRef.current = [];
    mixedRequestsExportDataRef.current = [];
    setShowConfirmModal(false);
    setCurrentStep("processing");
    setIsLoading((prev) => ({ ...prev, submitting: true }));
    setProgress(0);
    setProcessingLogs([]);
    setProcessingPhase(0);
    setProceedToStep2(null);

    let wakeLock: any = null;
    try {
      if ("wakeLock" in navigator) {
        // @ts-ignore
        wakeLock = await navigator.wakeLock.request("screen");
      }
    } catch (err) {}

    const summary: any[] = [];
    const UPDATE_BATCH_SIZE = 50;

    try {
      let pendingAdjustments = [...adjustmentsToReview];

      if (updateMethod === "migrate" && migrateFromAccountId && migrateToAccountId) {
        let step0Passed = false;
        let skipEmployeeIds = new Set<number>();
        let uniqueEmployees = Array.from(new Set(pendingAdjustments.map(a => a.employeeId)));
        
        while (!step0Passed) {
            setProcessingPhase(0);
            setLoadingText("Step 0: Validating destination accounts for all requests...");
            addLog("Step 0: Validating destination accounts...", "info");
            
            uniqueEmployees = Array.from(new Set(pendingAdjustments.map(a => a.employeeId)));
            let missingDestinationErrors: string[] = [];
            let currentMissingEmpIds = new Set<number>();
            let completedValidation = 0;

            for (let i = 0; i < uniqueEmployees.length; i += UPDATE_BATCH_SIZE) {
              if (abortRef.current) break;
              const batch = uniqueEmployees.slice(i, i + UPDATE_BATCH_SIZE);
              await Promise.all(batch.map(async (empId) => {
                 if (!empId) return;
                 try {
                    let accounts: any[] = [];
                    try { accounts = await fetchLeaveAccounts(empId, undefined, undefined); } catch(e) {}
                    
                    const empRequests = pendingAdjustments.filter(a => a.employeeId === empId);
                    for (const req of empRequests) {
                       if (!req.start) continue;
                       const rStart = new Date(req.start);
                       
                       const validToAccount = accounts.find((a: any) => {
                          const isTypeMatch = a.typeId === migrateToAccountId || a.accountType?.id === migrateToAccountId;
                          if (!isTypeMatch) return false;
                          const periodToUse = a.spendingPeriod || a.validityPeriod;
                          const vStart = periodToUse?.start ? new Date(periodToUse.start) : new Date(0);
                          const vEnd = periodToUse?.end ? new Date(periodToUse.end) : new Date(8640000000000000);
                          return rStart >= vStart && rStart <= vEnd;
                       });
                       
                       if (!validToAccount) {
                          missingDestinationErrors.push(`Employee: ${req.employeeName} is missing a valid destination account for request starting on ${req.start}`);
                          currentMissingEmpIds.add(empId);
                       }
                    }
                 } catch(e) {
                    console.error("Step 0 validation failed for employee", empId, e);
                 }
              }));
              completedValidation += batch.length;
              setProgress(Math.round((completedValidation / uniqueEmployees.length) * 10)); // up to 10% for step 0
            }

            if (abortRef.current) break;

            if (missingDestinationErrors.length > 0) {
               addLog(`Step 0 validation failed: Missing destination accounts for ${currentMissingEmpIds.size} employees.`, "error");
               
               const userChoice = await new Promise<"revalidate" | "skip" | "abort">((resolve) => {
                   setValidationFailedState({
                       errors: Array.from(new Set(missingDestinationErrors)),
                       resolve
                   });
               });
               
               setValidationFailedState(null);
               
               if (userChoice === "abort") {
                   abortRef.current = true;
                   addLog("Validation aborted by user.", "error");
                   break;
               } else if (userChoice === "skip") {
                   addLog(`Skipping ${currentMissingEmpIds.size} employees with missing destination accounts.`, "info");
                   currentMissingEmpIds.forEach(id => skipEmployeeIds.add(id));
                   step0Passed = true;
               } else if (userChoice === "revalidate") {
                   addLog("Re-validating destination accounts...", "info");
               }
            } else {
               step0Passed = true;
            }
        }

        if (abortRef.current) {
            setIsLoading((prev) => ({ ...prev, submitting: false }));
            setCurrentStep("review");
            return;
        }

        if (skipEmployeeIds.size > 0) {
            pendingAdjustments = pendingAdjustments.filter(a => {
                if (a.employeeId && skipEmployeeIds.has(a.employeeId)) {
                    a.status = "error";
                    a.error = "Skipped during Step 0 due to missing destination account";
                    if (!summary.some(s => s.id === a.id)) {
                       summary.push({...a, timestamp: new Date().toLocaleString()});
                    }
                    return false;
                }
                return true;
            });
        }

        addLog("Step 0: Validation successful.", "success");
        setProgress(10);
        setProcessingPhase(1);
        setStep1SuccessCount(0);
        setStep1ErrorCount(0);
        setLoadingText("Step 1: Denying old requests on source accounts...");
        addLog("Step 1: Started finding and denying/declining old requests on source accounts...", "info");
        let completedEmployees = 0;
        let step1FailedEmpIds = new Set<number>();
        
        uniqueEmployees = Array.from(new Set(pendingAdjustments.map(a => a.employeeId)));
        for (let i = 0; i < uniqueEmployees.length; i += UPDATE_BATCH_SIZE) {
          if (abortRef.current) {
             addLog("Aborted by user", "error");
             break;
          }
          const batch = uniqueEmployees.slice(i, i + UPDATE_BATCH_SIZE);
          await Promise.all(batch.map(async (empId) => {
            if (!empId) return;
            try {
              const [allReqs, allRecords, accounts] = await Promise.all([
                getAbsenceRequests(empId),
                getAbsenceRecords(empId).catch(() => []),
                fetchLeaveAccounts(empId, undefined, undefined).catch(() => [])
              ]);
              if (!accounts || accounts.length === 0) return;
              
              const processedIds = new Set<number>();

              const getAccountNamesString = (original: any) => {
                  const accIds = new Set<number>();
                  if (original.accountId) accIds.add(original.accountId);
                  if (original.requestedAccounts && Array.isArray(original.requestedAccounts)) {
                      original.requestedAccounts.forEach((a: any) => accIds.add(a.id));
                  }
                  if (original.registrations && Array.isArray(original.registrations)) {
                      original.registrations.forEach((reg: any) => { if (reg.account?.id) accIds.add(reg.account.id) });
                  }
                  return Array.from(accIds).map(id => accounts.find(a => a.id === id)?.name).filter(Boolean).join(", ");
              };              const fromAccountIds = new Set(accounts.filter((a: any) => a.typeId === migrateFromAccountId || a.accountType?.id === migrateFromAccountId).map((a: any) => a.id));
              const checkIsWithinPeriod = (r: any) => {
                let isWithinPeriod = false;
                const reqStart = (r.absencePeriod?.start || r.start || r.date)?.split("T")[0];
                const reqEnd = (r.absencePeriod?.end || r.end || r.date)?.split("T")[0] || reqStart;

                if (reqStart && reqEnd) {
                  if (migratePeriodMode === "custom" && migrateDateRange.start && migrateDateRange.end) {
                    if (reqStart <= migrateDateRange.end && reqEnd >= migrateDateRange.start) {
                      isWithinPeriod = true;
                    }
                  } else if (migratePeriodMode === "full") {
                    let vStart: string | undefined;
                    let vEnd: string | undefined;

                    if (migrateValidityPeriodsMap && migrateToAccountId && migrateValidityPeriodsMap[migrateToAccountId]) {
                      vStart = migrateValidityPeriodsMap[migrateToAccountId]!.start?.split("T")[0];
                      vEnd = migrateValidityPeriodsMap[migrateToAccountId]!.end?.split("T")[0];
                    } else if (migrateValidityPeriodsMap && migrateFromAccountId && migrateValidityPeriodsMap[migrateFromAccountId]) {
                      vStart = migrateValidityPeriodsMap[migrateFromAccountId]!.start?.split("T")[0];
                      vEnd = migrateValidityPeriodsMap[migrateFromAccountId]!.end?.split("T")[0];
                    }

                    if (!vStart || !vEnd) {
                      const toAccount = accounts.find((a: any) => a.typeId === migrateToAccountId || a.accountType?.id === migrateToAccountId);
                      const fromAccount = accounts.find((a: any) => a.id === r.accountId || r.requestedAccounts?.some((acc: any) => acc.id === a.id) || r.registrations?.some((reg: any) => reg.account?.id === a.id));
                      const period = toAccount?.validityPeriod || fromAccount?.validityPeriod;
                      if (period) {
                        vStart = period.start?.split("T")[0];
                        vEnd = period.end?.split("T")[0];
                      }
                    }

                    if (vStart && vEnd) {
                      if (reqStart <= vEnd && reqEnd >= vStart) {
                        isWithinPeriod = true;
                      }
                    }
                  }
                }
                return isWithinPeriod;
              };

              const reqsToDeny = allReqs.filter((r: any) => {
                const isMatch = r.requestedAccounts?.some((acc: any) => fromAccountIds.has(acc.id)) || fromAccountIds.has(r.accountId);
                const status = (r.status || "").toLowerCase();
                const isDenyable = status === "submitted" || status === "approved" || status === "pending";
                
                return isMatch && isDenyable && checkIsWithinPeriod(r);
              });
              const saveOldNote = (original: any) => {
                 if (original.note) {
                    oldNotesDataRef.current.push({
                        empId: original.employeeId || empId,
                        start: original.absencePeriod?.start || "",
                        end: original.absencePeriod?.end || original.absencePeriod?.start || "",
                        note: original.note
                    });
                 }
              };

              const handleMixedRequest = async (original: any) => {
                 let regs = original.registrations;
                 if (!regs && original.id) {
                    const inRecords = allRecords.find((rec: any) => rec.id === original.id);
                    if (inRecords && inRecords.registrations) {
                       regs = inRecords.registrations;
                    }
                 }
                 if (!regs && original.id) {
                    try {
                       const recDetails = await getAbsenceRecordById(original.id);
                       if (recDetails && recDetails.registrations) regs = recDetails.registrations;
                    } catch(e) {}
                 }
                 if (!regs && original.id) {
                    try {
                       const reqDetails = await getAbsenceRequestById(original.id);
                       if (reqDetails && reqDetails.registrations) regs = reqDetails.registrations;
                    } catch(e) {}
                 }

                 if (regs && Array.isArray(regs)) {
                     const otherRegs = regs.filter((reg: any) => reg.account && !fromAccountIds.has(reg.account.id));
                     const fromRegs = regs.filter((reg: any) => reg.account && fromAccountIds.has(reg.account.id));
                     
                     if (otherRegs.length > 0 && fromRegs.length > 0) {
                         const otherRegsWithUnit = otherRegs.map((r: any) => {
                             let resolvedUnit = "Hours";
                             const accId = r.account?.id;
                             if (accId) {
                                 const accObj = accounts.find((a: any) => a.id === accId);
                                 if (accObj) {
                                     const typeId = accObj.typeId || accObj.accountType?.id;
                                     const typeObj = accountTypes.find((t: any) => t.id === typeId);
                                     if (typeObj) {
                                         resolvedUnit = getExpectedUnit(typeObj) || "Hours";
                                     }
                                 }
                             }
                             return {
                                 ...r,
                                 resolvedUnit,
                                 accountName: accounts.find((a: any) => a.id === accId)?.name || ""
                             };
                         });

                         mixedRequestsDataRef.current.push({
                             empId: original.employeeId || empId,
                             reqId: original.id,
                             otherRegs: otherRegsWithUnit,
                             originalAbsenceType: original.absenceType,
                             fromDates: fromRegs.map((r: any) => r.date.split('T')[0])
                         });
                         const activeEmp = pendingAdjustments.find(a => String(a.employeeId) === String(original.employeeId || empId));
                         mixedRequestsExportDataRef.current.push({
                             empId: original.employeeId || empId,
                             employeeName: activeEmp ? activeEmp.employeeName : "Unknown",
                             salaryIdentifier: activeEmp?.salaryIdentifier || "",
                             reqId: original.id,
                             periodStart: original.absencePeriod?.start || "",
                             periodEnd: original.absencePeriod?.end || original.absencePeriod?.start || "",
                             otherRegs: otherRegsWithUnit,
                             fromRegs: fromRegs,
                             timestamp: new Date().toLocaleString()
                         });
                         addLog(`Stored mixed request ${original.id} for later recreation.`, "info");
                     }
                 } else {
                     const requestedAccounts = original.requestedAccounts;
                     if (requestedAccounts && Array.isArray(requestedAccounts)) {
                         const otherAccs = requestedAccounts.filter((acc: any) => !fromAccountIds.has(acc.id));
                         const fromAccs = requestedAccounts.filter((acc: any) => fromAccountIds.has(acc.id));
                         if (otherAccs.length > 0 && fromAccs.length > 0) {
                             addLog(`Warning: Request ${original.id} is mixed but has no daily registrations available. Recreating without specific dates might fail.`, "error");
                         }
                     }
                 }
              };

              for (const r of reqsToDeny) {
                try {
                  await denyAbsenceRequest(r.id);
                  processedIds.add(r.id);
                  addLog(`Successfully denied pending/submitted absence request ${r.id} for employee ${empId}`, "success");
                  setStep1SuccessCount(prev => prev + 1);
                  const activeEmp = pendingAdjustments.find(a => String(a.employeeId) === String(empId));
                  deniedRequestsDataRef.current.push({ ...r, accountNames: getAccountNamesString(r), employeeId: empId, employeeName: activeEmp ? activeEmp.employeeName : "Unknown", salaryIdentifier: activeEmp?.salaryIdentifier || "", timestamp: new Date().toLocaleString(), recordType: "request", status: "Denied" });
                  saveOldNote(r);
                  await handleMixedRequest(r);
                } catch (e: any) {
                  console.error("Failed to deny request", r.id, e);
                  addLog(`Failed to deny request ${r.id} for employee ${empId}: ${e.message}`, "error");
                  setStep1ErrorCount(prev => prev + 1);
                  step1FailedEmpIds.add(empId);
                }
              }

              const recordsToDecline = allRecords.filter((r: any) => {
                if (processedIds.has(r.id)) return false;
                const isMatch = r.registrations?.some((reg: any) => fromAccountIds.has(reg.account?.id)) || fromAccountIds.has(r.accountId);
                const status = (r.status || "").toLowerCase();
                const isDeclineable = status === "approved" || status === "submitted" || status === "pending";
                return isMatch && isDeclineable && checkIsWithinPeriod(r);
              });

              for (const r of recordsToDecline) {
                try {
                  await declineAbsenceRecord(r.id);
                  processedIds.add(r.id);
                  addLog(`Successfully declined approved absence record ${r.id} for employee ${empId}`, "success");
                  setStep1SuccessCount(prev => prev + 1);
                  const activeEmp = pendingAdjustments.find(a => String(a.employeeId) === String(empId));
                  deniedRequestsDataRef.current.push({ ...r, accountNames: getAccountNamesString(r), employeeId: empId, employeeName: activeEmp ? activeEmp.employeeName : "Unknown", salaryIdentifier: activeEmp?.salaryIdentifier || "", timestamp: new Date().toLocaleString(), recordType: "record", status: "Declined" });
                  saveOldNote(r);
                  await handleMixedRequest(r);
                } catch(e: any) {
                  console.error("Failed to decline record", r.id, e);
                  addLog(`Failed to decline record ${r.id} for employee ${empId}: ${e.message}`, "error");
                  setStep1ErrorCount(prev => prev + 1);
                  step1FailedEmpIds.add(empId);
                }
              }
            } catch (err: any) {
              console.error("Failed to fetch/process requests for employee " + empId, err);
              addLog(`Failed to fetch/process requests for employee ${empId}: ${err.message}`, "error");
              step1FailedEmpIds.add(empId);
            }
          }));
          completedEmployees += batch.length;
          setProgress(Math.round((completedEmployees / uniqueEmployees.length) * 100));
        }

        if (step1FailedEmpIds.size > 0) {
           pendingAdjustments = pendingAdjustments.filter(row => {
              if (row.employeeId && step1FailedEmpIds.has(row.employeeId)) {
                  row.status = "error";
                  row.error = "Failed to deny/decline previous requests in Step 1";
                  row.timestamp = new Date().toLocaleString();
                  summary.push(row);
                  return false;
              }
              return true;
           });
           if (pendingAdjustments.length === 0) {
               addLog("All requests failed in Step 1. Stopping process.", "error");
               setUpdateSummary(summary);
               setAdjustmentsToReview(summary as any);
               return;
           }
        }

        if (abortRef.current) {
           pendingAdjustments.forEach((row: any) => {
              row.status = "error";
              row.error = "Aborted by user during step 1";
              row.timestamp = new Date().toLocaleString();
              summary.push(row);
           });
           setUpdateSummary(summary);
           setAdjustmentsToReview(summary as any);
           return;
        }

        setProcessingPhase(1.5);
        addLog("Step 1 Complete. Please review the logs and click 'Proceed to Step 2' when ready.", "info");
        await new Promise<void>((resolve) => {
          setProceedToStep2(() => resolve);
        });
        if (abortRef.current) {
           pendingAdjustments.forEach((row: any) => {
              row.status = "error";
              row.error = "Aborted by user during step 1";
              row.timestamp = new Date().toLocaleString();
              summary.push(row);
           });
           setUpdateSummary(summary);
           setAdjustmentsToReview(summary as any);
           return;
        }
        setProceedToStep2(null);
        setProcessingPhase(2);
        setProcessingLogs([]);
        addLog("Step 2: Started recreating requests on destination accounts...", "info");
        setLoadingText("Step 2: Recreating requests on destination accounts...");
        setProgress(0);
      } else {
        setProcessingPhase(2);
        addLog("Starting update process...", "info");
      }

      // grouping
      const groupings = new Map<string, any[]>();
      pendingAdjustments.forEach((item) => {
        if (item.status === "error" && item.isValidationError) {
          summary.push(item);
          return;
        }
        if (!item.start) {
          item.status = "error";
          item.error = "Skipped - no date";
          summary.push({ ...item, timestamp: new Date().toLocaleString() });
          return;
        }
        const absenceType =
          accountTypes.find(
            (t) => t.name.toLowerCase() === item.accountName.toLowerCase()
          )?.absenceType || "Accrued";
        item.absenceType = absenceType;

        let originalReqId = "unknown";
        if (updateMethod === "migrate" && deniedRequestsDataRef.current.length > 0) {
           const originalReq = deniedRequestsDataRef.current.find(r => 
               String(r.employeeId) === String(item.employeeId) &&
               r.registrations && r.registrations.some((reg: any) => reg.date.startsWith(item.start))
           );
           if (originalReq) {
               originalReqId = String(originalReq.id);
           } else {
               const originalReqByPeriod = deniedRequestsDataRef.current.find(r => 
                  String(r.employeeId) === String(item.employeeId) &&
                  r.absencePeriod && 
                  item.start >= r.absencePeriod.start.split("T")[0] && 
                  item.start <= r.absencePeriod.end.split("T")[0]
               );
               if (originalReqByPeriod) originalReqId = String(originalReqByPeriod.id);
           }
        }

        const requestStatus = item.requestStatus || "Requested";
        const key = `${item.employeeName}_${item.accountId}_${item.billingMode}_${requestStatus}_${originalReqId}`;
        if (!groupings.has(key)) groupings.set(key, []);
        groupings.get(key)!.push(item);
      });

      let finalRequests: any[] = [];
      groupings.forEach((rows, key) => {
        const parseDate = (dstr: string) => {
          const [y, m, d] = dstr.split("-").map(Number);
          return new Date(y, m - 1, d);
        };

        rows.sort((a, b) => (a.start || "").localeCompare(b.start || ""));

        if (rows.length === 0) return;

        let chunks = [];
        const hasOriginalReqId = key.split('_').length > 4 && key.split('_')[4] !== 'unknown';

        if (hasOriginalReqId) {
            chunks = [rows];
        } else {
            let currentChunk = [rows[0]];
            chunks = [currentChunk];
            for (let i = 1; i < rows.length; i++) {
              const curr = rows[i];
              const prev = currentChunk[currentChunk.length - 1];
              const currDate = parseDate(curr.start);
              const prevDate = parseDate(prev.start);

              const diffTime = Math.abs(currDate.getTime() - prevDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

              if (diffDays === 1) {
                currentChunk.push(curr);
              } else {
                currentChunk = [curr];
                chunks.push(currentChunk);
              }
            }
        }

        chunks.forEach((chunk) => {
          const minStart = chunk[0].start;
          const maxEnd =
            chunk[chunk.length - 1].end || chunk[chunk.length - 1].start;
          const comment = chunk[0].comment;
          
          // Ensure the first comment is shown for all dates within this bundle
          chunk.forEach((r) => {
            r.comment = comment;
          });

          const absenceType = chunk[0].absenceType;
          const targetStatus = chunk[0].requestStatus || "Requested";

          // Bundle validation: all statuses must match
          const hasMixedStatus = chunk.some(
            (r) => (r.requestStatus || "Requested") !== targetStatus,
          );
          if (hasMixedStatus) {
            chunk.forEach((r) => {
              r.status = "error";
              r.error =
                "Mixed status in request bundle: Dates must share the same status (Approved/Requested/Denied).";
              summary.push({ ...r, timestamp: new Date().toLocaleString() });
            });
            return; // Skip this bundle
          }

          const registrations = chunk.map((r) => {
            let unitStr = "Hours";
            if (r.billingMode && r.billingMode.toLowerCase() === "days")
              unitStr = "Days";
            return {
              date: r.start,
              account: {
                id: r.accountId,
                costs: [
                  {
                    value: Number(r.cost),
                    unit: { type: unitStr },
                  },
                ],
              },
            };
          });

          let finalAbsenceType = absenceType;
          let finalMinStart = minStart;
          let finalMaxEnd = maxEnd;

          const chunkDates = chunk.map((r: any) => r.start);
          const chunkEmpId = chunk[0].employeeId;
          const oldNoteMatch = oldNotesDataRef.current.find(n => 
              n.empId === chunkEmpId && n.note && chunkDates.some((d: string) => d >= n.start && d <= n.end)
          );
          const oldNoteStr = oldNoteMatch ? oldNoteMatch.note : "";
          const matchingMixedReqs = mixedRequestsDataRef.current.filter(m => 
              m.empId === chunkEmpId && chunkDates.some((d: string) => m.fromDates.includes(d))
          );
          
          if (matchingMixedReqs.length > 0) {
              mixedRequestsDataRef.current = mixedRequestsDataRef.current.filter(m => 
                  !(m.empId === chunkEmpId && chunkDates.some((d: string) => m.fromDates.includes(d)))
              );

              matchingMixedReqs.forEach(matched => {
                  registrations.push(...matched.otherRegs.map((r: any) => ({
                      date: r.date.split('T')[0],
                      account: { id: r.account.id, costs: r.account.costs || r.account.cost || [{ value: 0, unit: { type: r.resolvedUnit || "Hours" } }] }
                  })));
                  if (matched.originalAbsenceType) {
                      finalAbsenceType = matched.originalAbsenceType;
                  }
              });

              const allDates = registrations.map(r => r.date).sort();
              finalMinStart = allDates[0];
              finalMaxEnd = allDates[allDates.length - 1];
          }

          finalRequests.push({
            originalRows: chunk,
            payload: {
              employeeId: chunk[0].employeeId,
              note: updateMethod === "migrate"
                ? (matchingMixedReqs.length > 0 
                    ? `Migrated via API from: “${chunk[0].originalAccountName}” (Recreated mixed request)${oldNoteStr ? ` - Note: ${oldNoteStr}` : ""}${comment ? ` - ${comment}` : ""}` 
                    : `Migrated via API from: “${chunk[0].originalAccountName}”${oldNoteStr ? ` - Note: ${oldNoteStr}` : ""}${comment ? ` - ${comment}` : ""}`)
                : (comment ? `${comment} - Bulk requested via API` : "Bulk requested via API"),
              absenceType: finalAbsenceType,
              absencePeriod: {
                start: finalMinStart,
                end: finalMaxEnd,
              },
              registrations: registrations,
            },
          });
        });
      });

      // Sort final requests so that "Denied" and "Rejected" requests are processed first.
      // This ensures that for duplicate dates on the same account/employee,
      // the denied requests are fully processed before the approved ones, avoiding
      // creating an approved request that blocks the subsequent denied request.
      finalRequests.sort((a, b) => {
        const statusA = (a.originalRows[0].requestStatus || "").toLowerCase();
        const statusB = (b.originalRows[0].requestStatus || "").toLowerCase();
        
        const isADenied = statusA === "denied" || statusA === "rejected";
        const isBDenied = statusB === "denied" || statusB === "rejected";
        
        if (isADenied && !isBDenied) return -1;
        if (isBDenied && !isADenied) return 1;
        return 0;
      });      // Group requests by employeeId to process sequentially per employee
      const requestsByEmployee = new Map<string, any[]>();
      finalRequests.forEach((req) => {
        const empId = String(req.payload.employeeId);
        if (!requestsByEmployee.has(empId)) requestsByEmployee.set(empId, []);
        requestsByEmployee.get(empId)!.push(req);
      });

      const employeeQueues = Array.from(requestsByEmployee.values());
      let completedRequests = 0;

      for (let i = 0; i < employeeQueues.length; i += UPDATE_BATCH_SIZE) {
        if (abortRef.current) break;
        const batchOfQueues = employeeQueues.slice(i, i + UPDATE_BATCH_SIZE);
        const promises = batchOfQueues.map(async (queue) => {
          for (const req of queue) {
            if (abortRef.current) break;
            const empId = req.payload.employeeId;
            try {
              const targetStatus =
                req.originalRows[0].requestStatus || "Requested";
              const res = await postAbsenceRequest(req.payload);
              let reqId = res.id || res.data?.id;

              if (reqId && targetStatus === "Approved") {
                await approveAbsenceRequest(reqId);
                addLog(`Created and approved request ${reqId} for employee ${empId}`, "success");
              } else if (reqId && targetStatus === "Denied") {
                await denyAbsenceRequest(reqId);
                addLog(`Created and denied request ${reqId} for employee ${empId}`, "success");
              } else {
                addLog(`Created request ${reqId} for employee ${empId} (Status: ${targetStatus})`, "success");
              }
              if (
                !reqId &&
                (targetStatus === "Approved" || targetStatus === "Denied")
              ) {
                console.warn(
                  "Could not find created request ID to apply " +
                    targetStatus +
                    " status.",
                );
              }

              req.originalRows.forEach((row: any) => {
                row.status = "success";
                row.error = "";
                row.timestamp = new Date().toLocaleString();
                if (req.payload?.note) row.comment = req.payload.note;
                summary.push(row);
              });
            } catch (err: any) {
              addLog(`Failed to create request for employee ${empId}: ${err.message}`, "error");
              req.originalRows.forEach((row: any) => {
                row.status = "error";
                row.error = err.message;
                row.timestamp = new Date().toLocaleString();
                if (req.payload?.note) row.comment = req.payload.note;
                summary.push(row);
              });
            }

            completedRequests++;
            setProgress(
              Math.round((completedRequests / finalRequests.length) * 100),
            );
          }
        });

        await Promise.all(promises);
      }

      if (abortRef.current) {
         finalRequests.forEach((req) => {
             if (!summary.includes(req.originalRows[0] as never)) {
                 req.originalRows.forEach((row: any) => {
                     row.status = "error";
                     row.error = "Aborted by user";
                     row.timestamp = new Date().toLocaleString();
                     summary.push(row);
                 });
             }
         });
      }

      setUpdateSummary(summary);
      setAdjustmentsToReview(summary as any);
    } catch (err: any) {
      handleApiError(err);
    } finally {
      // Release Wake Lock
      if (wakeLock) {
        try {
          await wakeLock.release();
        } catch (e) {}
      }
      setIsLoading((prev) => ({ ...prev, submitting: false }));
      setProgress(100);
      setCurrentStep("summary");
    }
  };

  const handleSelectAllTypes = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filteredTypes = accountTypes.filter((type) =>
      type.name.toLowerCase().includes(accountTypesSearch.toLowerCase()),
    );
    if (e.target.checked) {
      setSelectedTypeIds((prev) => {
        const newSet = new Set(prev);
        filteredTypes.forEach((t) => newSet.add(t.id));
        return newSet;
      });
    } else {
      setSelectedTypeIds((prev) => {
        const newSet = new Set(prev);
        filteredTypes.forEach((t) => newSet.delete(t.id));
        return newSet;
      });
    }
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = e.target.value;
    setDateRange((prev) => {
      let newEnd = prev.end;
      if (newStart) {
        const [y, m, d] = newStart.split("-").map(Number);
        const date = new Date(Date.UTC(y, m - 1, d));
        date.setUTCFullYear(date.getUTCFullYear() + 1);
        date.setUTCDate(date.getUTCDate() - 1);
        newEnd = date.toISOString().split("T")[0];
      }
      return { start: newStart, end: newEnd };
    });
  };

  const handleExportResults = () => {
    let headers: string[] = [];
    if (updateMethod === "migrate") {
      headers = [
        "Time Upload",
        "Employee",
        "Salary ID",
        "Date",
        "From Account",
        "To Account",
        "Cost",
        "Unit",
        "Comment",
        "Status",
        "Result message",
      ];
    } else {
      headers = [
        "Time Upload",
        "Employee",
        "Salary ID",
        "Date",
        "Account",
        "Cost",
        "Unit",
        "Comment",
        "Status",
        "Result message",
      ];
    }

    const data = updateSummary.map((item) => {
      const baseObj: any = {
        "Time Upload": item.timestamp || "",
        Employee: item.employeeName,
        "Salary ID": item.salaryIdentifier || "",
        Date: formatDateForDisplay(
          item.date || item.start || "",
          downloadDateFormat,
        ),
      };

      if (updateMethod === "migrate") {
         baseObj["From Account"] = item.accountName;
         baseObj["To Account"] = accountTypes.find(t => t.id === migrateToAccountId)?.name || "Unknown";
      } else {
         baseObj["Account"] = item.accountName;
      }

      baseObj["Cost"] = item.adjustment !== undefined ? item.adjustment : item.cost || 0;
      baseObj["Unit"] = item.unit || item.billingMode || "N/A";
      baseObj["Comment"] = item.comment || "";
      baseObj["Status"] = item.requestStatus || "Requested";
      baseObj["Result message"] = item.status === "error" || item.status === "skipped"
            ? item.error
            : "Uploaded Successfully";
      return baseObj;
    });

    const ws = XLSX.utils.json_to_sheet(data, { header: headers });

    // --- EXPORT STYLING START ---
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const borderStyle = {
      top: { style: "thin", color: { rgb: "d9d9d9" } },
      bottom: { style: "thin", color: { rgb: "d9d9d9" } },
      left: { style: "thin", color: { rgb: "d9d9d9" } },
      right: { style: "thin", color: { rgb: "d9d9d9" } },
    };

    const resultMsgIndex = headers.indexOf("Result message");

    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ c: C, r: R });
        if (!ws[cellAddress]) continue;

        if (!ws[cellAddress].s) ws[cellAddress].s = {};
        ws[cellAddress].s.border = borderStyle;

        // Header Row (Row 0): Background #112540, White text
        if (R === 0) {
          ws[cellAddress].s.fill = { fgColor: { rgb: "112540" } };
          ws[cellAddress].s.font = {
            bold: true,
            color: { rgb: "FFFFFF" },
            name: "Calibri",
            sz: 11,
          };
        } else {
          // Data Rows
          if (C === resultMsgIndex) {
            const cellVal = ws[cellAddress].v;
            if (cellVal === "Uploaded Successfully") {
              ws[cellAddress].s.font = { color: { rgb: "008000" }, bold: true }; // Green
            } else {
              ws[cellAddress].s.font = { color: { rgb: "CC0000" }, bold: true }; // Red
            }
          }
        }
      }
    }

    // Auto-width
    const wscols = headers.map((h) => ({ wch: h.length + 10 }));
    ws["!cols"] = wscols;
    // --- EXPORT STYLING END ---

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Upload Results");

    if (updateMethod === "migrate") {
       if (deniedRequestsDataRef.current.length > 0) {
           const deniedHeaders = ["Time Processed", "Employee", "Salary ID", "Account", "Period Start", "Period End", "Result Status", "Note"];
           const deniedData = deniedRequestsDataRef.current.map(item => ({
               "Time Processed": item.timestamp || "",
               "Employee": item.employeeName || "",
               "Salary ID": item.salaryIdentifier || "",
               "Account": item.accountNames || "",
               "Period Start": formatDateForDisplay(item.absencePeriod?.start || item.start || "", downloadDateFormat),
               "Period End": formatDateForDisplay(item.absencePeriod?.end || item.end || "", downloadDateFormat),
               "Result Status": item.status || "",
               "Note": item.note || item.comment || ""
           }));
           const wsDenied = XLSX.utils.json_to_sheet(deniedData, { header: deniedHeaders });
           if (wsDenied["!ref"]) {
               const rangeDenied = XLSX.utils.decode_range(wsDenied["!ref"]);
               for (let R = rangeDenied.s.r; R <= rangeDenied.e.r; ++R) {
                   for (let C = rangeDenied.s.c; C <= rangeDenied.e.c; ++C) {
                       const cellAddress = XLSX.utils.encode_cell({ c: C, r: R });
                       if (!wsDenied[cellAddress]) continue;
                       if (!wsDenied[cellAddress].s) wsDenied[cellAddress].s = {};
                       wsDenied[cellAddress].s.border = borderStyle;
                       if (R === 0) {
                           wsDenied[cellAddress].s.fill = { fgColor: { rgb: "112540" } };
                           wsDenied[cellAddress].s.font = { bold: true, color: { rgb: "FFFFFF" }, name: "Calibri", sz: 11 };
                       }
                   }
               }
           }
           wsDenied["!cols"] = deniedHeaders.map((h) => ({ wch: h.length + 10 }));
           XLSX.utils.book_append_sheet(wb, wsDenied, "Requests Denied");
       }
       if (mixedRequestsExportDataRef.current.length > 0) {
           const mixedHeaders = ["Time Processed", "Employee", "Salary ID", "Original Request ID", "Period Start", "Period End", "Other Accounts In Request"];
           const mixedData = mixedRequestsExportDataRef.current.map(item => ({
               "Time Processed": item.timestamp || "",
               "Employee": item.employeeName || "",
               "Salary ID": item.salaryIdentifier || "",
               "Original Request ID": item.reqId || "",
               "Period Start": formatDateForDisplay(item.periodStart || "", downloadDateFormat),
               "Period End": formatDateForDisplay(item.periodEnd || "", downloadDateFormat),
               "Other Accounts In Request": item.otherRegs ? item.otherRegs.map((r: any) => r.accountName || r.account?.id).filter(Boolean).join(", ") : ""
           }));
           const wsMixed = XLSX.utils.json_to_sheet(mixedData, { header: mixedHeaders });
           if (wsMixed["!ref"]) {
               const rangeMixed = XLSX.utils.decode_range(wsMixed["!ref"]);
               for (let R = rangeMixed.s.r; R <= rangeMixed.e.r; ++R) {
                   for (let C = rangeMixed.s.c; C <= rangeMixed.e.c; ++C) {
                       const cellAddress = XLSX.utils.encode_cell({ c: C, r: R });
                       if (!wsMixed[cellAddress]) continue;
                       if (!wsMixed[cellAddress].s) wsMixed[cellAddress].s = {};
                       wsMixed[cellAddress].s.border = borderStyle;
                       if (R === 0) {
                           wsMixed[cellAddress].s.fill = { fgColor: { rgb: "112540" } };
                           wsMixed[cellAddress].s.font = { bold: true, color: { rgb: "FFFFFF" }, name: "Calibri", sz: 11 };
                       }
                   }
               }
           }
           wsMixed["!cols"] = mixedHeaders.map((h) => ({ wch: h.length + 10 }));
           XLSX.utils.book_append_sheet(wb, wsMixed, "Mixed Requests");
       }
    }

    XLSX.writeFile(wb, "Planday_LeaveRequests_Results.xlsx");
  };

  // Tooltip Logic
  const handleTooltipEnter = (
    e: React.MouseEvent,
    content: React.ReactNode,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Position: Centered horizontally below the element, shifted down by 8px
    setActiveTooltip({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8,
      content,
    });
  };

  const handleTooltipLeave = () => {
    setActiveTooltip(null);
  };

  const stepConfig = getStepConfig(updateMethod);
  const stepIndex = stepConfig.order.indexOf(currentStep as any);

  // Sort summary: Do not sort by status anymore to maintain bundle order
  const sortedSummary = [...updateSummary];

  const hasValidityErrors = adjustmentsToReview.some(
    (a) => a.status === "error" && a.isValidationError,
  );
  const hasMissingDates = adjustmentsToReview.some((a) => !a.date);
  // hasValidationErrors is true if any error exists, but the user only sees them if attempted submit or validity error exists.
  const hasValidationErrors = hasValidityErrors || hasMissingDates;

  // Condition to show Date Format Report:
  // Show if a detection was made that differs from user preference, OR if we had to fallback due to ambiguity.
  // If we detected exactly what the user set, hide it.
  // EXCEPTION: If source is 'inherited' (meaning it was detected by context), we do NOT show report for it.
  const shouldShowDateReport =
    detectedColumnFormats &&
    (((detectedColumnFormats.effective.source === "fallback" ||
      detectedColumnFormats.effective.format !== downloadDateFormat) &&
      detectedColumnFormats.effective.source !== "inherited" &&
      detectedColumnFormats.effective.source !== "empty") ||
      ((detectedColumnFormats.validFrom.source === "fallback" ||
        detectedColumnFormats.validFrom.format !== downloadDateFormat) &&
        detectedColumnFormats.validFrom.source !== "inherited" &&
        detectedColumnFormats.validFrom.source !== "empty") ||
      ((detectedColumnFormats.validTo.source === "fallback" ||
        detectedColumnFormats.validTo.format !== downloadDateFormat) &&
        detectedColumnFormats.validTo.source !== "inherited" &&
        detectedColumnFormats.validTo.source !== "empty"));

  const uniqueBalanceDates = new Set<string>();
  adjustmentsToReview.forEach((r) => {
    if (r.balanceDate && r.balanceDate !== "N/A")
      uniqueBalanceDates.add(r.balanceDate);
  });
  const singleBalanceDate =
    uniqueBalanceDates.size === 1 ? Array.from(uniqueBalanceDates)[0] : null;

  // Helper to render label for the detected format
  const renderFormatLabel = (
    result: ColumnDetectionResult,
    columnContext: string,
  ) => {
    const example = result.format === "EU" ? "30/01" : "01/30";

    if (result.source === "detected") {
      return (
        <div className="flex items-center gap-1 group relative">
          <span className="font-mono font-bold text-gray-800">
            Detected: {result.format}
          </span>
          <InfoIcon className="h-3 w-3 text-blue-400 cursor-help" />
          <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-50">
            We determined the {columnContext} in the file to be {result.format}{" "}
            date format (e.g. {example}).
          </div>
        </div>
      );
    }
    if (result.source === "empty") {
      return (
        <div className="flex items-center gap-1 group relative">
          <span className="font-mono font-bold text-gray-500">
            Not Applicable (Empty)
          </span>
          <InfoIcon className="h-3 w-3 text-gray-400 cursor-help" />
          <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-50">
            No valid dates were found in the {columnContext} (e.g. all empty or
            N/A).
          </div>
        </div>
      );
    }
    if (result.source === "inherited") {
      return (
        <div className="flex items-center gap-1 group relative">
          <span className="font-mono font-bold text-gray-800">
            Detected: {result.format} (Inherited)
          </span>
          <InfoIcon className="h-3 w-3 text-blue-400 cursor-help" />
          <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-50">
            We inherited the {result.format} date format from another
            context/column.
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 group relative">
        <span className="font-mono font-bold text-amber-700">
          Ambiguous (Using {result.format})
        </span>
        <InfoIcon className="h-3 w-3 text-amber-500 cursor-help" />
        <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-50">
          Dates in this column were ambiguous (e.g. 01/02/2025). We are
          interpreting them as {result.format} based on your App Setting.
        </div>
      </div>
    );
  };

  const shouldShowBalanceColumns =
    updateMethod === "migrate"
      ? !!includeBalance
      : adjustmentsToReview.some(
          (r) =>
            r.availableBalance !== undefined &&
            r.availableBalance !== "N/A" &&
            r.availableBalance !== "Not retrieved" &&
            r.availableBalance !== "",
        );

  return (
    <div className="min-h-screen font-sans flex flex-col">
      {showUpdateBanner && (
        <div className="bg-blue-600 text-white px-4 py-3 shadow-md flex justify-between items-center z-50 sticky top-0">
          <div className="flex items-center space-x-3">
            <svg className="w-6 h-6 text-blue-100 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium text-sm sm:text-base">A new version of this tool is available. Please finish your current task, then click here to update.</span>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="ml-4 flex-shrink-0 px-4 py-2 bg-white text-blue-600 hover:bg-blue-50 font-semibold rounded-md shadow-sm transition-colors text-sm"
          >
            Update Now
          </button>
        </div>
      )}
      <div className="container mx-auto px-8 py-8 flex-grow">
        <PageHeader />
        <div className="my-12 max-w-[1280px] mx-auto">
          <Stepper current={stepIndex} steps={stepConfig.labels} />
        </div>

        {currentStep !== "auth" && (
          <div className="max-w-[896px] mx-auto flex items-center justify-center gap-3 mb-8 text-sm text-gray-700">
            <button
              onClick={loadConfigData}
              disabled={isLoading.types}
              className="text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-50"
              title="Refresh portal data"
            >
              <RefreshIcon
                className={`h-4 w-4 ${isLoading.types ? "animate-spin" : ""}`}
              />
            </button>
            <span>
              Logged in: <strong>{portalName || "Loading..."}</strong>
            </span>
            <span className="text-gray-300">|</span>
            <button
              onClick={handleLogout}
              className="text-gray-600 hover:text-gray-900 hover:underline underline-offset-2"
            >
              Change credentials (log out)
            </button>
          </div>
        )}

        <main>
          {error && (
            <div
              className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-6 max-w-[896px] mx-auto"
              role="alert"
            >
              {error}
            </div>
          )}

          {currentStep === "auth" && (
            <AuthStep onAuthSuccess={handleAuthSuccess} />
          )}

          {currentStep === "configure" && (
            <div className="bg-white p-8 rounded-lg shadow-md max-w-[896px] mx-auto">
              <div className="mb-10">
                <h2 className="text-2xl font-bold mb-6 text-gray-800">
                  Select Upload Method
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <button
                    onClick={() => setUpdateMethod("excel")}
                    className={`flex flex-col items-center justify-center p-8 rounded-xl border-2 transition-all ${
                      updateMethod === "excel"
                        ? "border-blue-500 bg-blue-50/50"
                        : "border-gray-200 hover:border-blue-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="h-12 w-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                      <svg
                        className="h-6 w-6"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Use Excel
                    </h3>
                    <p className="text-sm text-gray-500 text-center">
                      Download a template and edit in Excel
                    </p>
                  </button>
                  <button
                    onClick={() => setUpdateMethod("migrate")}
                    className={`flex flex-col items-center justify-center p-8 rounded-xl border-2 transition-all ${
                      updateMethod === "migrate"
                        ? "border-blue-500 bg-blue-50/50"
                        : "border-gray-200 hover:border-blue-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="h-12 w-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                      <svg
                        className="h-6 w-6"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Migrate Requests
                    </h3>
                    <p className="text-sm text-gray-500 text-center">
                      Migrate requests from one account to another
                    </p>
                  </button>
                </div>
              </div>

              <div className="pt-8 border-t border-gray-100">
                {/* ... Configuration Step UI ... */}
                {updateMethod !== "excel" && (
                  <h2 className="text-2xl font-bold mb-6 text-gray-800">
                    Select Accounts to Migrate
                  </h2>
                )}
                <div className="space-y-6">
                  {updateMethod === "migrate" ? (
                    <div className="space-y-6">
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Select the Leave Account that you wish to migrate
                            requests from
                          </label>
                          <select
                            value={migrateFromAccountId || ""}
                            onChange={(e) =>
                              setMigrateFromAccountId(
                                Number(e.target.value) || null,
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">
                              -- Select Source Account --
                            </option>
                            {accountTypes
                              .filter((type: AccountType) => !type.isDeleted)
                              .map((type: AccountType) => (
                                <option
                                  key={type.id}
                                  value={type.id}
                                  disabled={type.id === migrateToAccountId}
                                  className={
                                    type.id === migrateToAccountId
                                      ? "line-through text-gray-400"
                                      : ""
                                  }
                                >
                                  {type.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Select the Leave Account that you wish to migrate
                            requests to
                          </label>
                          <select
                            value={migrateToAccountId || ""}
                            onChange={(e) =>
                              setMigrateToAccountId(
                                Number(e.target.value) || null,
                              )
                            }
                            disabled={migrateValidityPeriodsMap === null}
                            className={`w-full px-3 py-2 border rounded-md shadow-sm text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                              migrateValidityPeriodsMap === null ? "bg-gray-100 border-gray-200 cursor-not-allowed" : "border-gray-300"
                            }`}
                          >
                            <option value="">
                              -- Select Destination Account --
                            </option>
                            {accountTypes
                              .filter((type: AccountType) => !type.isDeleted)
                              .map((type: AccountType) => (
                                <option
                                  key={type.id}
                                  value={type.id}
                                  disabled={type.id === migrateFromAccountId}
                                  className={
                                    type.id === migrateFromAccountId
                                      ? "line-through text-gray-400"
                                      : ""
                                  }
                                >
                                  {type.name}
                                </option>
                              ))}
                          </select>
                          {migrateValidityPeriodsMap === null && (
                            <p className="mt-2 text-xs text-blue-600 animate-pulse flex items-center">
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Preparing compatibility checks... you can select the destination shortly.
                            </p>
                          )}
                        </div>
                      </div>
                      {migrateFromAccountId &&
                        migrateToAccountId &&
                        (() => {
                          const fromAcc = accountTypes.find(
                            (a: AccountType) => a.id === migrateFromAccountId,
                          );
                          const toAcc = accountTypes.find(
                            (a: AccountType) => a.id === migrateToAccountId,
                          );

                          if (migrateValidityPeriodsMap === null) {
                            return (
                              <div className="text-sm text-gray-500 animate-pulse">
                                Checking validity periods...
                              </div>
                            );
                          }

                          const migrateFromValidityInfo =
                            migrateValidityPeriodsMap[migrateFromAccountId];
                          const migrateToValidityInfo =
                            migrateValidityPeriodsMap[migrateToAccountId];

                          const today = new Date().toISOString().split("T")[0];

                          const isInactive = (info: { start: string; end: string } | null | undefined) => {
                            if (!info) return false;
                            const start = info.start.split("T")[0];
                            const end = info.end.split("T")[0];
                            return today < start || today > end;
                          };

                          const fromValStr = migrateFromValidityInfo
                            ? JSON.stringify(migrateFromValidityInfo)
                            : "Not specified / Not found";
                          const toValStr = migrateToValidityInfo
                            ? JSON.stringify(migrateToValidityInfo)
                            : "Not specified / Not found";

                          const isFromInactive = isInactive(migrateFromValidityInfo);
                          const isToInactive = isInactive(migrateToValidityInfo);

                          const fromUnit = getExpectedUnit(fromAcc)?.toLowerCase() || "";
                          const toUnit = getExpectedUnit(toAcc)?.toLowerCase() || "";
                          let unitMismatchBanner = null;

                          if (fromUnit === "days" && toUnit === "hours") {
                            unitMismatchBanner = (
                              <div className="bg-blue-50 text-blue-800 p-4 rounded-md border border-blue-200 mt-4">
                                <h4 className="font-bold flex items-center mb-2">
                                  <InfoIcon className="h-5 w-5 mr-2" /> Unit Mismatch (Days &rarr; Hours)
                                </h4>
                                <p className="text-sm mb-3">
                                  The source account tracks <strong>days</strong>, but the destination account tracks <strong>hours</strong>.
                                  Please specify how many hours constitute a full day. The system will automatically convert requests (e.g. 0.5 days &rarr; 3.7 hours).
                                </p>
                                <div className="flex flex-col">
                                  <div className="flex items-center space-x-3">
                                    <label className="text-sm font-semibold">1 Day =</label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.1"
                                      value={migrateDaysToHoursRatio}
                                      onChange={(e) => setMigrateDaysToHoursRatio(Number(e.target.value) || 0)}
                                      className="w-24 px-2 py-1 text-sm border border-gray-300 rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                    <span className="text-sm">Hours</span>
                                  </div>
                                  {migrateDaysToHoursRatio > 0 && (
                                    <div className="text-xs text-blue-700 mt-1.5 ml-[4.5rem]">
                                      Auto-conversion: {Math.floor(migrateDaysToHoursRatio)} hours and {Math.round((migrateDaysToHoursRatio % 1) * 60)} minutes
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          } else if (fromUnit === "hours" && toUnit === "days") {
                            unitMismatchBanner = (
                              <div className="bg-yellow-50 text-yellow-800 p-4 rounded-md border border-yellow-200 mt-4">
                                <h4 className="font-bold flex items-center mb-2">
                                  <InfoIcon className="h-5 w-5 mr-2" /> Unit Mismatch (Hours &rarr; Days)
                                </h4>
                                <p className="text-sm">
                                  The source account tracks <strong>hours</strong>, but the destination account tracks <strong>days</strong>.
                                  All dates with a current hourly cost will be counted as <strong>1 day</strong>. Dates where the hourly cost was <strong>0</strong> will be counted as <strong>0 days</strong>.
                                </p>
                              </div>
                            );
                          }

                          let banner = null;
                          // Show banner if they differ or if either is inactive
                          if (fromValStr !== toValStr || isFromInactive || isToInactive) {
                            banner = (
                              <div className="bg-yellow-50 text-yellow-800 p-4 rounded-md border border-yellow-200">
                                <h4 className="font-bold flex items-center mb-2">
                                  <InfoIcon className="h-5 w-5 mr-2" /> Please
                                  Note: Validity Periods
                                </h4>
                                <p className="text-sm mb-2">
                                  {fromValStr !== toValStr 
                                    ? "The selected accounts have different validity periods:" 
                                    : "One or more of the selected accounts are currently inactive:"}
                                </p>
                                <ul className="list-disc pl-5 text-sm">
                                  <li>
                                    <strong>
                                      From Account ({fromAcc?.name}):
                                    </strong>{" "}
                                    {migrateFromValidityInfo
                                      ? `${migrateFromValidityInfo.start} to ${migrateFromValidityInfo.end} ${isFromInactive ? "(Inactive)" : ""}`
                                      : "Not found"}
                                  </li>
                                  <li>
                                    <strong>To Account ({toAcc?.name}):</strong>{" "}
                                    {migrateToValidityInfo
                                      ? `${migrateToValidityInfo.start} to ${migrateToValidityInfo.end} ${isToInactive ? "(Inactive)" : ""}`
                                      : "Not found"}
                                  </li>
                                </ul>
                              </div>
                            );
                          }
                          return (
                            <>
                              {banner}
                              {unitMismatchBanner}
                              <div className="mt-6 p-4 border border-gray-200 rounded-md bg-white">
                                <h3 className="text-sm font-bold text-gray-700 mb-3">
                                  Select Period for Migrated Requests
                                </h3>
                                <div className="space-y-3">
                                  <label className="flex items-center space-x-3 cursor-pointer">
                                    <input
                                      type="radio"
                                      name="migratePeriodMode"
                                      value="full"
                                      checked={migratePeriodMode === "full"}
                                      onChange={() => setMigratePeriodMode("full")}
                                      className="form-radio text-blue-600 h-4 w-4"
                                    />
                                    <span className="text-sm text-gray-700">
                                      Current Period (Use destination accounts' validity start and end dates)
                                      {(() => {
                                        let vStart = migrateToValidityInfo?.start;
                                        let vEnd = migrateToValidityInfo?.end;
                                        if (!vStart || !vEnd) {
                                          vStart = migrateFromValidityInfo?.start;
                                          vEnd = migrateFromValidityInfo?.end;
                                        }
                                        if (vStart && vEnd) {
                                          return <span className="font-semibold ml-1">({vStart.split("T")[0]} to {vEnd.split("T")[0]})</span>;
                                        }
                                        return null;
                                      })()}
                                    </span>
                                  </label>
                                  <label className="flex items-center space-x-3 cursor-pointer">
                                    <input
                                      type="radio"
                                      name="migratePeriodMode"
                                      value="custom"
                                      checked={migratePeriodMode === "custom"}
                                      onChange={() => setMigratePeriodMode("custom")}
                                      className="form-radio text-blue-600 h-4 w-4"
                                    />
                                    <span className="text-sm text-gray-700">
                                      Select Custom Dates
                                    </span>
                                  </label>
                                </div>
                                {migratePeriodMode === "custom" && (
                                  <div className="mt-3 pl-7 flex items-center space-x-2 transition-all">
                                    <input
                                      type="date"
                                      value={migrateDateRange.start}
                                      onChange={(e) =>
                                        setMigrateDateRange((prev) => ({
                                          ...prev,
                                          start: e.target.value,
                                        }))
                                      }
                                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
                                    <span className="text-gray-500 text-sm">to</span>
                                    <input
                                      type="date"
                                      value={migrateDateRange.end}
                                      onChange={(e) =>
                                        setMigrateDateRange((prev) => ({
                                          ...prev,
                                          end: e.target.value,
                                        }))
                                      }
                                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
                                  </div>
                                )}
                              </div>
                            </>
                          );
                        })()}
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          {updateMethod !== "excel" ? (
                            <label className="block text-sm font-medium text-gray-700">
                              1. Select Account Types (Policies) to Include
                            </label>
                          ) : (
                            <label className="block text-sm font-medium text-gray-700 mb-4">
                              Information for Template
                            </label>
                          )}
                          {updateMethod !== "excel" &&
                            accountTypes.length > 0 && (
                              <div className="flex items-center">
                                <input
                                  id="select-all-types"
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  checked={
                                    accountTypes.length > 0 &&
                                    accountTypes.filter((type) =>
                                      type.name
                                        .toLowerCase()
                                        .includes(
                                          accountTypesSearch.toLowerCase(),
                                        ),
                                    ).length > 0 &&
                                    accountTypes
                                      .filter((type) =>
                                        type.name
                                          .toLowerCase()
                                          .includes(
                                            accountTypesSearch.toLowerCase(),
                                          ),
                                      )
                                      .every((type) =>
                                        selectedTypeIds.has(type.id),
                                      )
                                  }
                                  ref={(input) => {
                                    if (input) {
                                      const filtered = accountTypes.filter(
                                        (type) =>
                                          type.name
                                            .toLowerCase()
                                            .includes(
                                              accountTypesSearch.toLowerCase(),
                                            ),
                                      );
                                      const someSelected = filtered.some(
                                        (type) => selectedTypeIds.has(type.id),
                                      );
                                      const allSelected =
                                        filtered.length > 0 &&
                                        filtered.every((type) =>
                                          selectedTypeIds.has(type.id),
                                        );
                                      input.indeterminate =
                                        someSelected && !allSelected;
                                    }
                                  }}
                                  onChange={handleSelectAllTypes}
                                />
                                <label
                                  htmlFor="select-all-types"
                                  className="ml-2 block text-sm text-gray-900 cursor-pointer"
                                >
                                  Select All
                                </label>
                              </div>
                            )}
                        </div>
                        {updateMethod !== "excel" &&
                          accountTypes.length > 0 && (
                            <div className="mb-3">
                              <input
                                type="text"
                                placeholder="Search account types..."
                                value={accountTypesSearch}
                                onChange={(e) =>
                                  setAccountTypesSearch(e.target.value)
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                          )}
                        {updateMethod === "excel" ? (
                          <div className="bg-blue-50 text-blue-700 p-4 rounded-md text-sm mb-4">
                            You can generate a template to use for bulk upload
                            of leave requests. The file will contain the
                            necessary columns needed, example data, and
                            instructions. You can also choose to include
                            employee and leave account data which will be added
                            as a "Leave Accounts" sheet with all available leave
                            accounts for the filtered employees below.
                          </div>
                        ) : isLoading.types ? (
                          <Loader text="Loading account types..." />
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-72 overflow-y-auto p-3 bg-gray-50 rounded-md border">
                            {accountTypes
                              .filter((type) =>
                                type.name
                                  .toLowerCase()
                                  .includes(accountTypesSearch.toLowerCase()),
                              )
                              .map((type) => (
                                <label
                                  key={type.id}
                                  className="flex items-start space-x-3 p-2 bg-white border border-gray-200 rounded-md cursor-pointer hover:bg-gray-100 transition-colors"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedTypeIds.has(type.id)}
                                    onChange={() =>
                                      setSelectedTypeIds((p) => {
                                        const n = new Set(p);
                                        n.has(type.id)
                                          ? n.delete(type.id)
                                          : n.add(type.id);
                                        return n;
                                      })
                                    }
                                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                                  />
                                  <div className="flex-1 flex items-start justify-between gap-2">
                                    <span
                                      className="text-sm break-words leading-tight"
                                      title={type.name}
                                    >
                                      {type.name}
                                    </span>
                                    {type.absenceType === "Flextime" ? (
                                      <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800">
                                        FLEX/TOIL
                                      </span>
                                    ) : type.accruingRate?.value === 0 &&
                                      type.accruingRate?.unit?.type ===
                                        "Percent" ? (
                                      <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-800">
                                        Fixed
                                      </span>
                                    ) : (
                                      <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-800">
                                        Accrued
                                      </span>
                                    )}
                                  </div>
                                </label>
                              ))}
                          </div>
                        )}
                      </div>

                      {updateMethod === "editor" && (
                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            <div className="flex items-center mb-2">
                              <label className="block text-sm font-medium text-gray-700 mr-2">
                                2. Select Validity Period (Required)
                              </label>
                              <div className="relative group">
                                <InfoIcon className="h-5 w-5 text-gray-400 hover:text-blue-500 cursor-help" />
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-72 p-3 bg-gray-900 text-white text-xs rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 text-left">
                                  <p>
                                    <strong>Current:</strong> Only active
                                    accounts (Today is within the valid period).
                                  </p>
                                  <p className="mt-1">
                                    <strong>Current + Upcoming:</strong> Active
                                    accounts plus any that start in the future.
                                    (Excludes past/expired).
                                  </p>
                                  <p className="mt-1">
                                    <strong>Select Dates:</strong> Manually
                                    choose a range. You can check 'Include
                                    Inactive' to find expired accounts in that
                                    range.
                                  </p>
                                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2 mb-4">
                              <label className="flex items-center space-x-3 cursor-pointer">
                                <input
                                  type="radio"
                                  name="validityMode"
                                  value="current"
                                  checked={validityMode === "current"}
                                  onChange={() => setValidityMode("current")}
                                  className="form-radio text-blue-600 h-4 w-4"
                                />
                                <span className="text-sm text-gray-700">
                                  Current
                                </span>
                              </label>
                              <label className="flex items-center space-x-3 cursor-pointer">
                                <input
                                  type="radio"
                                  name="validityMode"
                                  value="current_future"
                                  checked={validityMode === "current_future"}
                                  onChange={() =>
                                    setValidityMode("current_future")
                                  }
                                  className="form-radio text-blue-600 h-4 w-4"
                                />
                                <span className="text-sm text-gray-700">
                                  Current + Upcoming
                                </span>
                              </label>
                              <label className="flex items-center space-x-3 cursor-pointer">
                                <input
                                  type="radio"
                                  name="validityMode"
                                  value="custom"
                                  checked={validityMode === "custom"}
                                  onChange={() => setValidityMode("custom")}
                                  className="form-radio text-blue-600 h-4 w-4"
                                />
                                <span className="text-sm text-gray-700">
                                  Select Dates
                                </span>
                              </label>
                            </div>

                            {validityMode === "custom" && (
                              <div className="pl-7 space-y-3 transition-all duration-300 ease-in-out">
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="date"
                                    value={dateRange.start}
                                    onChange={handleStartDateChange}
                                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Start Date"
                                  />
                                  <span className="text-gray-500 text-sm">
                                    to
                                  </span>
                                  <input
                                    type="date"
                                    value={dateRange.end}
                                    onChange={(e) =>
                                      setDateRange((p) => ({
                                        ...p,
                                        end: e.target.value,
                                      }))
                                    }
                                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="End Date"
                                  />
                                </div>
                                <label className="inline-flex items-center cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={includeInactive}
                                    onChange={(e) =>
                                      setIncludeInactive(e.target.checked)
                                    }
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="ml-2 text-sm text-gray-700">
                                    Include inactive (expired) accounts in this
                                    range
                                  </span>
                                </label>
                              </div>
                            )}
                          </div>

                          <div
                            className={`p-4 rounded-md transition-colors ${balanceOptionError ? "bg-red-50 border border-red-300" : ""}`}
                          >
                            <div className="flex items-center mb-2">
                              <label
                                className={`block text-sm font-medium mr-2 ${balanceOptionError ? "text-red-700" : "text-gray-700"}`}
                              >
                                3. Include Available Balance?
                              </label>
                              <div className="relative group">
                                <InfoIcon
                                  className={`h-5 w-5 cursor-help ${balanceOptionError ? "text-red-400 hover:text-red-500" : "text-gray-400 hover:text-blue-500"}`}
                                />
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-96 p-4 bg-gray-900 text-white text-xs rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 text-left leading-relaxed">
                                  <ul className="mb-2 space-y-2 list-disc pl-4">
                                    <li>
                                      <strong>No:</strong> The template will not
                                      contain the available balance from the
                                      employees' leave accounts. Only use this
                                      option if you already know the current
                                      available balance and want to make quick
                                      requests.
                                    </li>
                                    <li>
                                      <strong>Yes:</strong> The app will fetch
                                      the available balance on the date
                                      selected. Inside the file, you will be
                                      able to make requests according to the
                                      available balance and set a "New balance".
                                      The file will calculate the difference
                                      between the "Available balance" and "New
                                      balance" to post the needed requests.
                                      Consider matching the date selected
                                      (Balance Date) with the “Effective date”
                                      in the template.
                                    </li>
                                  </ul>

                                  <div className="pt-2 border-t border-gray-700 mt-2">
                                    <p className="text-yellow-300 font-bold mb-1">
                                      Important info on the Available Balance:
                                    </p>
                                    <ul className="space-y-1 list-disc pl-4 text-yellow-300">
                                      <li>
                                        <strong>Accounts with Accruals:</strong>{" "}
                                        If you select a date that is earlier
                                        than the account end date, the file will
                                        only show the balance accrued up to that
                                        specific date. Future accruals will not
                                        be included in the available balance.
                                      </li>
                                      <li>
                                        <strong>Past Leave:</strong> All
                                        approved leave requests BEFORE this date
                                        are already deducted from the displayed
                                        available balance.
                                      </li>
                                      <li>
                                        <strong>Future Leave:</strong> Any
                                        approved leave requests AFTER this date
                                        are NOT deducted from the displayed
                                        available balance.
                                      </li>
                                    </ul>
                                  </div>
                                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                </div>
                              </div>
                            </div>

                            {balanceOptionError && (
                              <p className="text-xs text-red-600 font-medium mb-2 animate-pulse">
                                {balanceOptionError}
                              </p>
                            )}

                            <div className="flex items-center space-x-4 mb-3">
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-blue-600"
                                  name="includeBalance"
                                  checked={includeBalance === true}
                                  onChange={() => {
                                    setIncludeBalance(true);
                                    setBalanceOptionError(null);
                                  }}
                                />
                                <span className="ml-2 text-sm text-gray-700">
                                  Yes
                                </span>
                              </label>
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-blue-600"
                                  name="includeBalance"
                                  checked={includeBalance === false}
                                  onChange={() => {
                                    setIncludeBalance(false);
                                    setBalanceOptionError(null);
                                  }}
                                />
                                <span className="ml-2 text-sm text-gray-700">
                                  No
                                </span>
                              </label>
                            </div>

                            <div
                              className={`flex items-center space-x-2 transition-opacity ${!includeBalance ? "opacity-50 pointer-events-none" : ""}`}
                            >
                              <input
                                type="date"
                                value={balanceDate}
                                onChange={(e) => {
                                  setBalanceDate(e.target.value);
                                  setBalanceOptionError(null);
                                }}
                                disabled={!includeBalance}
                                className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                              />
                              <button
                                onClick={() => {
                                  setBalanceDate(getTodayYYYYMMDD());
                                  setBalanceOptionError(null);
                                }}
                                disabled={!includeBalance}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md border border-gray-300 text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                              >
                                Today
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Filters Section */}
                {updateMethod === "excel" && (
                  <div className="mt-8 bg-white p-4 border border-gray-200 rounded-lg shadow-sm">
                    <h3 className="text-sm font-bold text-gray-700 mb-2">
                      Include Available Leave Accounts in the Template?
                    </h3>
                    <div className="flex items-center space-x-4">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          className="form-radio text-blue-600"
                          name="includeEmployeeAccounts"
                          checked={includeEmployeeAccounts === false}
                          onChange={() => setIncludeEmployeeAccounts(false)}
                        />
                        <span className="text-sm text-gray-700">No</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          className="form-radio text-blue-600"
                          name="includeEmployeeAccounts"
                          checked={includeEmployeeAccounts === true}
                          onChange={() => setIncludeEmployeeAccounts(true)}
                        />
                        <span className="text-sm text-gray-700">Yes</span>
                      </label>
                    </div>
                  </div>
                )}

                {(updateMethod !== "excel" || includeEmployeeAccounts) && (
                  <div className="mt-8 bg-gray-50 p-4 border border-gray-200 rounded-lg">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">
                      Filter Employees
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            {usePrimaryDepartmentOnly
                              ? "PRIMARY DEPARTMENT"
                              : "DEPARTMENT"}
                          </label>
                          <div className="flex items-center space-x-1 group relative">
                            <button
                              onClick={() =>
                                setUsePrimaryDepartmentOnly(
                                  !usePrimaryDepartmentOnly,
                                )
                              }
                              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${usePrimaryDepartmentOnly ? "bg-orange-500" : "bg-gray-300"}`}
                            >
                              <span
                                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${usePrimaryDepartmentOnly ? "translate-x-3.5" : "translate-x-0.5"}`}
                              />
                            </button>
                            <InfoIcon className="h-4 w-4 text-orange-400 hover:text-orange-500 cursor-help" />
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 text-left leading-relaxed">
                              <p className="mb-1">
                                You can filter by Primary Department.
                              </p>
                              <p>
                                Note: Employees without a designated primary
                                department will not appear in the template file.
                                To use this filter, ensure the feature is
                                enabled and assigned to everyone.
                              </p>
                            </div>
                          </div>
                        </div>
                        <MultiSelectDropdown
                          label={
                            usePrimaryDepartmentOnly
                              ? "Primary Department"
                              : "Department"
                          }
                          pluralLabel={
                            usePrimaryDepartmentOnly
                              ? "Primary Departments"
                              : "Departments"
                          }
                          options={departments}
                          selectedIds={selectedDepartmentIds}
                          onChange={setSelectedDepartmentIds}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                          EMPLOYEE GROUP
                        </label>
                        <MultiSelectDropdown
                          label="Employee Group"
                          pluralLabel="Employee groups"
                          options={employeeGroups}
                          selectedIds={selectedEmployeeGroupIds}
                          onChange={setSelectedEmployeeGroupIds}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                          EMPLOYEE TYPE
                        </label>
                        <MultiSelectDropdown
                          label="Employee Type"
                          pluralLabel="Employee types"
                          options={employeeTypes}
                          selectedIds={selectedEmployeeTypeIds}
                          onChange={setSelectedEmployeeTypeIds}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-8 pt-6 border-t border-gray-200">
                  {isLoading.template ? (
                    <div className="flex flex-col items-center">
                      <ProgressBar progress={progress} text={loadingText} />
                      <button
                        onClick={() => setShowStopProcessModal(true)}
                        className="mt-6 bg-red-100 hover:bg-red-200 text-red-700 font-semibold py-2 px-6 rounded-md shadow-sm transition-colors duration-200"
                      >
                        Stop Process
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end space-x-4 items-center">
                      {/* Date Format Selection for Download */}
                      <div className="flex items-center mr-4 bg-gray-50 px-3 py-2 rounded-md border border-gray-200">
                        <span className="text-sm font-medium text-gray-700 mr-2">
                          Date Format:
                        </span>
                        <select
                          value={downloadDateFormat}
                          onChange={(e) =>
                            setDownloadDateFormat(e.target.value as "EU" | "US")
                          }
                          className="text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="EU">EU (DD/MM/YYYY)</option>
                          <option value="US">US (MM/DD/YYYY)</option>
                        </select>
                        <div className="relative group ml-2">
                          <InfoIcon className="h-4 w-4 text-gray-400 hover:text-blue-500 cursor-help" />
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 text-left">
                            <p>
                              Choose the date format for the downloaded Excel
                              file.
                            </p>
                            <ul className="list-disc list-inside mt-1 space-y-1 text-gray-300">
                              <li>
                                <strong>EU:</strong> 31/01/2025 (Day First)
                              </li>
                              <li>
                                <strong>US:</strong> 01/31/2025 (Month First)
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      {updateMethod === "excel" && (
                        <button
                          onClick={() => setCurrentStep("upload")}
                          className="bg-white hover:bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-md border border-gray-300 shadow-sm"
                        >
                          Next &rarr; Upload file
                        </button>
                      )}
                      <button
                        onClick={handleDownloadTemplate}
                        disabled={
                          updateMethod !== "excel" && (!migrateFromAccountId || !migrateToAccountId || migrateValidityPeriodsMap === null)
                        }
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md disabled:bg-gray-400 flex items-center justify-center min-w-[200px]"
                      >
                        {updateMethod === "excel"
                          ? "Download Template"
                          : "Next \u2192 Migrate Options"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {currentStep === "migrateOptions" && (
            <div className="bg-white p-8 rounded-lg shadow-md max-w-[896px] mx-auto">
              <h2 className="text-2xl font-bold mb-6 text-gray-800">
                Choose Migration Method
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <button
                  className="flex flex-col items-center justify-center p-8 rounded-xl border-2 border-blue-500 bg-blue-50/50 transition-all text-left"
                >
                  <div className="h-12 w-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Migrate via file
                  </h3>
                  <p className="text-sm text-gray-500 text-center">
                    Upload an export of leave requests from Planday
                  </p>
                </button>
                <button
                  disabled
                  className="flex flex-col items-center justify-center p-8 rounded-xl border-2 border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed transition-all text-left"
                >
                  <div className="h-12 w-12 bg-gray-200 text-gray-400 rounded-full flex items-center justify-center mb-4">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Migrate direct (Coming soon)
                  </h3>
                  <p className="text-sm text-gray-500 text-center">
                    Automatically fetch and transfer requests
                  </p>
                </button>
              </div>

              <div className="bg-blue-50 text-blue-800 p-6 rounded-md border border-blue-200 mb-8 text-sm">
                <h3 className="font-bold mb-2">Instructions for File Migration:</h3>
                <ol className="list-decimal list-inside space-y-2">
                  <li>In Planday, go to <strong>Leave {'>'} Leave requests {'>'} Export</strong>.</li>
                  <li>Select the date range (the validity period for the leave account you are migrating).</li>
                  <li>Select all options <strong>except</strong> "Exclude days outside the date range".</li>
                  <li>Click <strong>Download file</strong>.</li>
                  <li>Open the file, and <strong>move the second sheet to be the first sheet</strong> (or delete sheet 1).</li>
                  <li>Upload the modified file below.</li>
                </ol>
                <p className="mt-4 font-semibold text-blue-900">
                  The app will automatically filter for rows matching your selected "From" account and recreate them on the "To" account. It will also highlight any employees who don't have the "To" account ready.
                </p>
              </div>

              <h3 className="text-lg font-bold mb-4 text-gray-800">Upload Export File</h3>
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer relative ${
                  isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById("migrate-file-upload")?.click()}
              >
                <input
                  id="migrate-file-upload"
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={handleFileInputChange}
                  onClick={(e) => {
                    (e.target as HTMLInputElement).value = "";
                  }}
                />
                <UploadCloudIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-600 mb-2 font-medium">
                  Click to browse or drag and drop your file here
                </p>
                <p className="text-gray-400 text-sm">XLSX or XLS only</p>
              </div>

              <div className="flex justify-start mt-8">
                <button
                  onClick={() => setCurrentStep("configure")}
                  className="bg-white hover:bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-md border border-gray-300 shadow-sm"
                >
                  &larr; Back
                </button>
              </div>
            </div>
          )}

          {currentStep === "upload" && (
            <div className="bg-white p-8 rounded-lg shadow-md max-w-[672px] mx-auto">
              {/* ... Upload Step UI ... */}
              <h2 className="text-2xl font-bold mb-2 text-gray-800">
                Upload Template
              </h2>
              <p className="text-gray-500 mb-6">
                Select the completed Excel file with your leave requests. Make
                sure to use the provided template format or similar format. The
                requests will be read from the file and prepared for your review
                before the upload process starts.
              </p>

              {uploadConflicts && (
                <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <ExclamationIcon className="h-5 w-5 text-red-400" />
                    </div>
                    <div className="ml-3 w-full">
                      <h3 className="text-sm font-bold text-red-800">
                        CRITICAL ERROR: Ambiguous or Conflicting Date Formats
                      </h3>
                      <p className="text-sm text-red-700 mt-1">
                        The app found conflicting date formats (US vs EU) within
                        the same column or between Validity columns. We cannot
                        proceed because we don't know which date is correct.
                      </p>
                      <div className="mt-3 text-sm">
                        {uploadConflicts.map((conflict, i) => (
                          <div key={i} className="mb-2">
                            <p className="font-semibold text-red-900">
                              Column: {conflict.column}
                            </p>
                            <ul className="list-disc list-inside ml-2 text-red-800">
                              {conflict.details.map((msg, j) => (
                                <li key={j}>{msg}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                      <p className="text-sm text-red-800 mt-2 font-bold mb-3">
                        Please fix these rows in your Excel file and re-upload.
                      </p>

                      <button
                        onClick={() => {
                          setUploadConflicts(null);
                          setCurrentStep("configure");
                        }}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md text-sm transition-colors shadow-sm"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {uploadValidityErrors && (
                <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <ExclamationIcon className="h-5 w-5 text-red-400" />
                    </div>
                    <div className="ml-3 w-full">
                      <h3 className="text-sm font-bold text-red-800">
                        Data Validation Errors
                      </h3>
                      <p className="text-sm text-red-700 mt-1">
                        The uploaded file contains rows with missing or invalid
                        dates.
                      </p>
                      <div className="mt-3 text-sm max-h-48 overflow-y-auto">
                        {uploadValidityErrors.map((err, i) => (
                          <div key={i} className="mb-2">
                            <p className="font-semibold text-red-900">
                              Row {err.row}
                            </p>
                            <ul className="list-disc list-inside ml-2 text-red-800">
                              {err.details.map((msg, j) => (
                                <li key={j}>{msg}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                      <p className="text-sm text-red-800 mt-2 font-bold mb-3">
                        Please correct these cells in your Excel file and
                        re-upload.
                      </p>

                      <button
                        onClick={() => {
                          setUploadValidityErrors(null);
                          setCurrentStep("configure");
                        }}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md text-sm transition-colors shadow-sm"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* File input is always present but hidden */}
              <input
                id="file-upload-input"
                type="file"
                onChange={handleFileInputChange}
                accept=".xlsx, .xls"
                className="hidden"
              />

              {!uploadConflicts && !uploadValidityErrors && (
                <div
                  className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() =>
                    document.getElementById("file-upload-input")?.click()
                  }
                >
                  <div className="flex flex-col items-center justify-center">
                    <UploadCloudIcon
                      className={`w-12 h-12 mb-4 ${isDragging ? "text-blue-500" : "text-gray-400"}`}
                    />
                    <p className="text-gray-600 font-medium">
                      Drop file or click to browse
                    </p>
                    <p className="text-gray-400 text-sm mt-2">
                      Supports .xlsx, .xls
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => setCurrentStep("configure")}
                  className="bg-white hover:bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-md border border-gray-300 shadow-sm"
                >
                  &larr; Back
                </button>
              </div>
            </div>
          )}

          {currentStep === "review" && (
            <div className="bg-white px-4 py-8 md:px-8 border-x border-b shadow-md w-full max-w-[1400px] mx-auto rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-2xl font-bold text-gray-800">
                  Review & Send requests
                </h2>
              </div>

              {/* Date Format Detection Report - Conditionally Shown */}
              {shouldShowDateReport && detectedColumnFormats && (
                <div className="mb-6 bg-blue-50 border-l-4 border-blue-500 p-4">
                  <div className="flex flex-col">
                    <div className="flex items-center mb-2">
                      <InfoIcon className="h-5 w-5 text-blue-400 mr-2" />
                      <p className="text-sm text-blue-700 font-bold">
                        Date Format Report
                      </p>
                    </div>
                    <p className="text-sm text-blue-600 mb-3">
                      We found ambiguous dates or formats differing from your
                      preference. We <strong>automatically converted</strong>{" "}
                      these dates to match your app setting.
                    </p>

                    {dateReportExample && (
                      <>
                        <p className="text-sm text-blue-700 font-bold mb-2">
                          Detected Ambiguous Date and Conversion Example
                        </p>

                        <div className="mb-4 p-3 bg-white rounded border border-blue-200 text-xs text-gray-700 shadow-sm space-y-2">
                          <div>
                            <span className="font-semibold text-blue-800">
                              Location:
                            </span>{" "}
                            Row {dateReportExample.rowNumber} <br />
                            <span className="text-gray-500">
                              Employee: {dateReportExample.employee} | Account:{" "}
                              {dateReportExample.account}
                            </span>
                          </div>
                          <div>
                            <span className="font-semibold text-blue-800">
                              Detection:
                            </span>{" "}
                            Found value{" "}
                            <code className="bg-gray-100 px-1 py-0.5 rounded font-bold">
                              {dateReportExample.rawValue}
                            </code>{" "}
                            in column <em>{dateReportExample.columnName}</em>.
                          </div>
                          <div>
                            <span className="font-semibold text-blue-800">
                              Conversion:
                            </span>{" "}
                            Because your app setting is{" "}
                            <strong>{downloadDateFormat}</strong>, we converted
                            the full column to match this format:
                            <div className="mt-1 flex items-center gap-2">
                              <span className="line-through text-gray-400">
                                {dateReportExample.rawValue}
                              </span>
                              <span>&rarr;</span>
                              <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded font-bold border border-green-200">
                                {dateReportExample.convertedValue}
                              </span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-blue-800 bg-blue-100 p-2 rounded w-full md:w-auto">
                        <div className="flex justify-between border-b md:border-b-0 md:border-r border-blue-200 px-2 gap-3 items-center">
                          <span className="font-semibold">
                            Validity Period:
                          </span>
                          {renderFormatLabel(
                            detectedColumnFormats.validFrom,
                            "Validity Period Columns",
                          )}
                        </div>
                        <div className="flex justify-between px-2 gap-3 items-center">
                          <span className="font-semibold">Effective Date:</span>
                          {renderFormatLabel(
                            detectedColumnFormats.effective,
                            "Effective Date Column",
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-500">
                          Current Format Setting:{" "}
                          <span className="text-gray-800">
                            {downloadDateFormat}
                          </span>
                        </span>
                        <button
                          onClick={handleSwitchDateFormat}
                          className="whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-3 rounded shadow transition-colors flex items-center"
                        >
                          <RefreshIcon className="h-3 w-3 mr-1" />
                          Switch to {downloadDateFormat === "EU" ? "US" : "EU"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Filters and Bulk Actions */}
              <div className="mb-6 space-y-6">
                {/* Table Filters */}
                <div className="bg-gray-50 p-4 rounded border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                    <FilterIcon className="h-4 w-4 mr-2" /> Filter Accounts in
                    Table
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          {usePrimaryDepartmentOnly
                            ? "PRIMARY DEPARTMENT"
                            : "DEPARTMENT"}
                        </label>
                        <div className="flex items-center space-x-1 group relative">
                          <button
                            onClick={() =>
                              setUsePrimaryDepartmentOnly(
                                !usePrimaryDepartmentOnly,
                              )
                            }
                            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${usePrimaryDepartmentOnly ? "bg-orange-500" : "bg-gray-300"}`}
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${usePrimaryDepartmentOnly ? "translate-x-3.5" : "translate-x-0.5"}`}
                            />
                          </button>
                          <InfoIcon className="h-4 w-4 text-orange-400 hover:text-orange-500 cursor-help" />
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 text-left leading-relaxed">
                            <p className="mb-1">
                              You can filter by Primary Department.
                            </p>
                            <p>
                              Note: Employees without a designated primary
                              department will not appear when this is active. To
                              use this filter, ensure the feature is enabled and
                              assigned to everyone.
                            </p>
                          </div>
                        </div>
                      </div>
                      <MultiSelectDropdown
                        label={
                          usePrimaryDepartmentOnly
                            ? "Primary Department"
                            : "Department"
                        }
                        pluralLabel={
                          usePrimaryDepartmentOnly
                            ? "Primary Departments"
                            : "Departments"
                        }
                        options={departments}
                        selectedIds={reviewDepartmentIds}
                        onChange={setReviewDepartmentIds}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        EMPLOYEE GROUP
                      </label>
                      <MultiSelectDropdown
                        label="Employee Group"
                        pluralLabel="Employee groups"
                        options={employeeGroups}
                        selectedIds={reviewEmployeeGroupIds}
                        onChange={setReviewEmployeeGroupIds}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        EMPLOYEE TYPE
                      </label>
                      <MultiSelectDropdown
                        label="Employee Type"
                        pluralLabel="Employee types"
                        options={employeeTypes}
                        selectedIds={reviewEmployeeTypeIds}
                        onChange={setReviewEmployeeTypeIds}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        LEAVE ACCOUNT
                      </label>
                      <MultiSelectDropdown
                        label="Leave Account Name"
                        pluralLabel="Leave account names"
                        options={uniqueAccountNames}
                        selectedIds={reviewLeaveAccountNames}
                        onChange={setReviewLeaveAccountNames}
                      />
                    </div>
                  </div>
                </div>
              </div>
              {/* Table Error Banner */}
              {totalTableErrors > 0 && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <ExclamationIcon className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-red-800 font-bold text-sm">
                      Action Required
                    </h4>
                    <p className="text-red-700 text-sm mt-1">
                      There are {totalTableErrors} row
                      {totalTableErrors !== 1 ? "s" : ""} with validation errors
                      in your table.
                    </p>
                    <p className="text-red-700 text-sm mt-1">
                      You must correct these errors or remove the affected rows
                      before you can continue to send the requests.
                    </p>
                  </div>
                </div>
              )}
              {/* Table Toolbar */}
              <div className="mb-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-xl font-bold text-gray-800">
                    Pending Requests
                  </h3>
                  <div className="bg-gray-100 rounded-full px-3 py-1 flex items-center justify-center gap-1">
                    <span className="text-orange-500 text-sm">
                      <span className="font-bold">{bundledRequestsCount}</span>{" "}
                      leave requests to be created
                    </span>
                    <div
                      className="flex items-center cursor-help"
                      onClick={(e) => e.stopPropagation()}
                      onMouseEnter={(e) =>
                        handleTooltipEnter(
                          e,
                          <div className="text-left w-64 normal-case text-xs text-white">
                            All leave requests will get bundled and sent upon
                            confirmation, not just the filtered/selected ones.
                          </div>,
                        )
                      }
                      onMouseLeave={handleTooltipLeave}
                    >
                      <InfoIcon className="h-4 w-4 text-orange-400 hover:text-orange-600" />
                    </div>
                  </div>
                  {totalTableErrors > 0 && errorFilterRowIds === null && (
                    <button
                      onClick={toggleErrorFilter}
                      className="text-sm bg-orange-100 text-orange-800 hover:bg-orange-200 px-3 py-1.5 rounded font-semibold transition-colors flex items-center gap-1 ml-2 border border-orange-200"
                    >
                      <FilterIcon className="h-4 w-4" />
                      Filter errors
                    </button>
                  )}
                  {errorFilterRowIds !== null && (
                    <button
                      onClick={toggleErrorFilter}
                      className="text-sm bg-blue-100 text-blue-800 hover:bg-blue-200 px-3 py-1.5 rounded font-semibold transition-colors flex items-center gap-1 ml-2 border border-blue-200"
                    >
                      <FilterIcon className="h-4 w-4" />
                      Show all requests
                    </button>
                  )}
                  {totalTableErrors > 0 && (
                    <button
                      onClick={handleSelectAllErrors}
                      className="text-sm bg-red-100 text-red-800 hover:bg-red-200 px-3 py-1.5 rounded font-semibold transition-colors flex items-center gap-1 ml-2 border border-red-200"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Select all rows with errors
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                  <div className="relative border border-gray-300 rounded shadow-sm overflow-hidden flex items-center bg-white">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 ml-2 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search Employee..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-2 pr-3 py-1.5 text-sm text-gray-700 border-none focus:ring-0 focus:outline-none w-56"
                    />
                  </div>

                  <div className="hidden sm:block h-6 w-px bg-gray-300 mx-1"></div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase">
                      Sort:
                    </span>
                    <button
                      onClick={() => handleSort("employeeName")}
                      className={`px-3 py-1.5 text-xs font-medium border rounded transition-colors ${sortConfig?.key === "employeeName" ? "bg-blue-50 border-blue-300 text-blue-700 shadow-sm" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-white hover:border-gray-300"}`}
                    >
                      Employee
                    </button>
                    <button
                      onClick={() => handleSort("accountName")}
                      className={`px-3 py-1.5 text-xs font-medium border rounded transition-colors ${sortConfig?.key === "accountName" ? "bg-blue-50 border-blue-300 text-blue-700 shadow-sm" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-white hover:border-gray-300"}`}
                    >
                      Account
                    </button>
                    <button
                      onClick={() => handleSort("date" as any)}
                      className={`px-3 py-1.5 text-xs font-medium border rounded transition-colors ${sortConfig?.key === "date" ? "bg-blue-50 border-blue-300 text-blue-700 shadow-sm" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-white hover:border-gray-300"}`}
                    >
                      Date
                    </button>
                    <button
                      onClick={() => handleSort("status")}
                      className={`px-3 py-1.5 text-xs font-medium border rounded transition-colors ${sortConfig?.key === "status" ? "bg-red-50 border-red-300 text-red-700 shadow-sm" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-white hover:border-gray-300"}`}
                    >
                      Errors
                    </button>
                    <button
                      onClick={() => handleSort("employeeMatchType" as any)}
                      className={`px-3 py-1.5 text-xs font-medium border rounded transition-colors ${sortConfig?.key === "employeeMatchType" ? "bg-blue-50 border-blue-300 text-blue-700 shadow-sm" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-white hover:border-gray-300"}`}
                    >
                      Match
                    </button>
                  </div>

                  <div className="hidden sm:block h-6 w-px bg-gray-300 mx-1 flex-grow-0 ml-auto"></div>

                  <div className="flex items-center gap-2 sm:ml-0 ml-auto">
                    <button
                      onClick={undoAdjustments}
                      disabled={pastLength === 0}
                      className={`px-3 py-1.5 text-sm font-medium border rounded-md flex items-center justify-center gap-1.5 transition-colors ${pastLength > 0 ? "bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-sm" : "bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed"}`}
                      title="Undo"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9 14 4 9l5-5" />
                        <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v1.5" />
                      </svg>
                      Undo
                    </button>
                    <button
                      onClick={redoAdjustments}
                      disabled={futureLength === 0}
                      className={`px-3 py-1.5 text-sm font-medium border rounded-md flex items-center justify-center gap-1.5 transition-colors ${futureLength > 0 ? "bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-sm" : "bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed"}`}
                      title="Redo"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M15 14l5-5-5-5" />
                        <path d="M19 9H8.5A5.5 5.5 0 0 0 3 14.5V16" />
                      </svg>
                      Redo
                    </button>
                  </div>
                </div>
              </div>

              <div className="max-h-[800px] overflow-y-auto border rounded-lg shadow-sm">
                <table className="w-full text-sm text-left relative">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th scope="col" className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={
                            sortedReviews.length > 0 &&
                            Array.from(selectedReviewIds).some((id) =>
                              sortedReviews.some((r) => r.id === id),
                            )
                          }
                          onChange={(e) => {
                            if (e.target.checked) handleSelectFiltered();
                            else setSelectedReviewIds(new Set());
                          }}
                        />
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 align-middle text-left"
                      >
                        <div className="flex flex-col flex-start py-2">
                          <div
                            className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 transition-colors group px-2 py-1 rounded"
                            onClick={() => handleSort("employeeName")}
                          >
                            <span className="flex items-center gap-1">
                              Employee ({reviewBundleCounts.filtered}/
                              {reviewBundleCounts.total})
                              <div className="group/tooltip relative inline-flex items-center">
                                <InfoIcon
                                  className="h-3 w-3 text-gray-400 cursor-help hover:text-blue-500"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-64 p-2 bg-gray-900 text-white text-xs rounded transition-opacity normal-case shadow-xl z-50 text-left invisible opacity-0 group-hover/tooltip:visible group-hover/tooltip:opacity-100 font-normal pointer-events-none">
                                  The first number in the bracket is the current
                                  filtered requests, and the second number is
                                  the total number of requests included for
                                  uploads.
                                </div>
                              </div>
                            </span>
                            {sortConfig?.key === "employeeName" &&
                              (sortConfig.direction === "asc" ? (
                                <SortAscIcon className="h-3 w-3" />
                              ) : (
                                <SortDescIcon className="h-3 w-3" />
                              ))}
                          </div>
                          {selectedReviewIds.size > 0 && (
                            <div className="flex gap-2 w-full justify-start mt-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleClearSelection();
                                }}
                                className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700"
                              >
                                Clear
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveSelected();
                                }}
                                className="text-xs px-2 py-1 rounded border border-red-300 bg-red-50 hover:bg-red-100 text-red-700"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 align-middle text-left cursor-pointer hover:bg-gray-100 transition-colors group"
                        onClick={() => handleSort("accountName")}
                      >
                        <div className="flex items-center justify-start gap-1">
                          {updateMethod === "migrate" ? "From Account" : "Account"}{" "}
                          {sortConfig?.key === "accountName" &&
                            (sortConfig.direction === "asc" ? (
                              <SortAscIcon className="h-3 w-3" />
                            ) : (
                              <SortDescIcon className="h-3 w-3" />
                            ))}
                        </div>
                      </th>
                      {updateMethod === "migrate" && (
                        <th
                          scope="col"
                          className="px-4 py-3 align-middle text-left"
                        >
                          To Account
                        </th>
                      )}
                      <th
                        scope="col"
                        className="px-4 py-3 align-middle text-left cursor-pointer hover:bg-gray-100 transition-colors group w-32"
                        onClick={() => handleSort("date")}
                      >
                        <div className="flex items-center justify-start gap-1">
                          Date{" "}
                          {sortConfig?.key === "date" &&
                            (sortConfig.direction === "asc" ? (
                              <SortAscIcon className="h-3 w-3" />
                            ) : (
                              <SortDescIcon className="h-3 w-3" />
                            ))}
                        </div>
                      </th>
                      <th
                        scope="col"
                        className="px-2 py-3 align-middle text-left w-24"
                      >
                        Cost
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 align-middle text-left w-24"
                      >
                        Unit
                      </th>

                      <th
                        scope="col"
                        className="px-4 py-3 align-middle text-left"
                      >
                        Comment
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 align-middle text-left w-32"
                      >
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedReviews.map((adj, idx) => {
                      const showSeparator = adj.isRequestStart || idx === 0;
                      const fromDate = adj.requestStartDate ? formatDateForDisplay(adj.requestStartDate, downloadDateFormat) : "";
                      const toDate = adj.requestEndDate ? formatDateForDisplay(adj.requestEndDate, downloadDateFormat) : "";
                      const dateRangeText = fromDate === toDate 
                        ? `Leave Request ${fromDate}`
                        : `Leave Request ${fromDate} - ${toDate}`;
                        
                      const isRowError = adj.isValidationError || !adj.date;
                      return (
                        <React.Fragment key={adj.id}>
                          {showSeparator && (
                            <tr>
                              <td
                                colSpan={updateMethod === "migrate" ? 9 : 8}
                                className="text-center py-2 bg-gray-100 text-gray-500 font-medium text-sm border-y border-gray-200"
                              >
                                {idx === 0 && !adj.isRequestStart ? (
                                  <span className="italic">{dateRangeText} (continued)</span>
                                ) : (
                                  <span>{dateRangeText}</span>
                                )}
                              </td>
                            </tr>
                          )}
                          <tr
                            className={`border-b hover:bg-gray-50 ${isRowError ? "bg-red-50" : adj.accountStatus === "Inactive" ? "bg-yellow-50" : "bg-white"}`}
                          >
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                checked={selectedReviewIds.has(adj.id)}
                                onChange={() => toggleReviewSelection(adj.id)}
                              />
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900 leading-tight align-middle">
                              <div className="flex items-center gap-1">
                                <span>{adj.employeeName}</span>
                                {adj.employeeMatchType === "exact" && (
                                  <div className="group/match relative inline-flex">
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover/match:opacity-100">
                                      Exact match by Salary ID and Name
                                    </div>
                                  </div>
                                )}
                                {adj.employeeMatchType === "salary" && (
                                  <div className="group/match relative inline-flex">
                                    <CheckCircle2 className="w-4 h-4 text-purple-500" />
                                    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-pre-wrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover/match:opacity-100 text-center w-64">
                                      Matched via Salary ID{"\n"}The employee name in the file differs from the name in the portal: {adj.portalEmployeeName}
                                    </div>
                                  </div>
                                )}
                                {adj.employeeMatchType === "name" && (
                                  <div className="group/match relative inline-flex">
                                    <CheckCircle2 className="w-4 h-4 text-orange-500" />
                                    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-pre-wrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover/match:opacity-100 text-center w-64">
                                      Matched via Name{"\n"}The Salary/Payroll ID in the file differs from the ID in the portal: {adj.portalSalaryIdentifier || 'N/A'}
                                    </div>
                                  </div>
                                )}
                                {adj.employeeMatchType === "none" && (
                                  <div className="group/match relative inline-flex">
                                    <XCircle className="w-4 h-4 text-red-500" />
                                    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-pre-wrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover/match:opacity-100 text-center w-48">
                                      Employee not found{"\n"}Try find the employee inside the portal and check the name and salary/payroll ID
                                    </div>
                                  </div>
                                )}
                              </div>
                              {adj.salaryIdentifier && (
                                <div className="text-xs font-mono text-gray-500 mt-0.5">
                                  SID: {adj.salaryIdentifier}
                                </div>
                              )}
                              {adj.error && (
                                <div className="text-xs font-bold text-red-600 mt-1 max-w-[200px] break-words">
                                  {adj.error}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 align-middle">
                              {adj.accountName}
                              {adj.accountStatus === 'Inactive' && !adj.error && (
                                <div className="text-xs font-bold text-yellow-600 mt-1 max-w-[200px] break-words">
                                  Account is currently inactive (still possible to submit requests)
                                </div>
                              )}
                            </td>
                            {updateMethod === "migrate" && (
                              <td className="px-4 py-3 align-middle">
                                {accountTypes.find(t => t.id === migrateToAccountId)?.name || "Unknown"}
                              </td>
                            )}

                            <td className="px-4 py-3 font-mono text-gray-600 align-middle">
                              <div className="flex flex-col justify-center items-center w-full h-full">
                                <input
                                  type="date"
                                  value={adj.date || ""}
                                  onChange={(e) => {
                                    const newReviews = [...adjustmentsToReview];
                                    const idx = newReviews.findIndex(
                                      (r) => r.id === adj.id,
                                    );
                                    if (idx !== -1) {
                                      newReviews[idx] = validateReviewItem(
                                        {
                                          ...newReviews[idx],
                                          date: e.target.value,
                                          start: e.target.value,
                                          end: e.target.value,
                                        },
                                        accountTypes,
                                      ) as any;
                                    }
                                    setAdjustmentsToReview(newReviews as any);
                                  }}
                                  className={`text-sm border rounded px-2 py-1 w-full max-w-[140px] ${!adj.date ? "border-red-500 ring-1 ring-red-500 text-red-700" : "border-gray-300"}`}
                                  disabled={isLoading.submitting}
                                />
                              </div>
                            </td>
                            <td className="px-2 py-3 align-middle">
                              <EditableCell
                                value={
                                  adj.cost !== undefined &&
                                  adj.cost !== null &&
                                  adj.cost !== ""
                                    ? adj.cost
                                    : ""
                                }
                                type="number"
                                width="w-16"
                                min={0}
                                max={
                                  adj.billingMode?.toLowerCase() === "hours"
                                    ? 24
                                    : adj.billingMode?.toLowerCase() === "days"
                                      ? 1
                                      : undefined
                                }
                                onChange={(val) => {
                                  const newReviews = [...adjustmentsToReview];
                                  const idx = newReviews.findIndex(
                                    (r) => r.id === adj.id,
                                  );
                                  if (idx !== -1)
                                    newReviews[idx] = validateReviewItem(
                                      { ...newReviews[idx], cost: val },
                                      accountTypes,
                                    ) as any;
                                  setAdjustmentsToReview(newReviews as any);
                                }}
                              />
                            </td>
                            <td className="px-4 py-3 align-middle text-gray-600 text-sm">
                              {adj.billingMode || "-"}
                              {adj.billingModeError && (
                                <div className="text-xs text-orange-600 mt-1 leading-tight font-medium">
                                  {adj.billingModeError}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3 align-middle">
                              {adj.isSubsequentInBundle ? (
                                <span className="text-gray-400 italic text-xs">
                                  - comment set in the first date -
                                </span>
                              ) : (
                                <EditableCell
                                  value={adj.comment || ""}
                                  width="w-full"
                                  align="left"
                                  type="textarea"
                                  onChange={(val) => {
                                    const newReviews = [...adjustmentsToReview];
                                    const idx = newReviews.findIndex(
                                      (r) => r.id === adj.id,
                                    );
                                    if (idx !== -1)
                                      newReviews[idx] = validateReviewItem(
                                        { ...newReviews[idx], comment: val },
                                        accountTypes,
                                      ) as any;
                                    setAdjustmentsToReview(newReviews as any);
                                  }}
                                />
                              )}
                            </td>
                            <td className="px-2 py-3 align-middle text-xs">
                              <select
                                value={adj.requestStatus || "Requested"}
                                onChange={(e) =>
                                  handleStatusChange(adj.id, e.target.value)
                                }
                                className={`w-full text-xs font-bold border-0 rounded px-2 py-1.5 focus:outline-none focus:ring-2 cursor-pointer shadow-sm ${
                                  (adj.requestStatus || "Requested") ===
                                  "Requested"
                                    ? "!bg-amber-100 !text-amber-900 focus:ring-amber-400"
                                    : (adj.requestStatus || "Requested") ===
                                        "Approved"
                                      ? "!bg-emerald-100 !text-emerald-900 focus:ring-emerald-400"
                                      : "!bg-rose-100 !text-rose-900 focus:ring-rose-400"
                                }`}
                              >
                                <option value="Requested">Requested</option>
                                <option value="Approved">Approved</option>
                                <option value="Denied">Denied</option>
                              </select>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Payload Example Monitor */}
              {adjustmentsToReview.length > 0 && (
                <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg shadow-sm">
                  <h3 className="text-sm font-bold text-gray-700 mb-2">
                    Payload Monitor (Preview of First Bundle)
                  </h3>
                  <pre className="text-xs bg-gray-800 text-green-400 p-4 rounded overflow-auto max-h-64">
                    {JSON.stringify(
                      (() => {
                        const pendingAdjustments = adjustmentsToReview;
                        const groupings = new Map<string, any[]>();
                        pendingAdjustments.forEach((item) => {
                          if (item.status === "error" && item.isValidationError)
                            return;
                          if (!item.start) return;

                          const absenceType =
                            accountTypes.find(
                              (t) => t.name.toLowerCase() === item.accountName.toLowerCase()
                            )?.absenceType || "Accrued";
                          const requestStatus = item.requestStatus || "Requested";
                          const key = `${item.employeeName}_${item.accountId}_${item.billingMode}_${requestStatus}`;
                          if (!groupings.has(key)) groupings.set(key, []);
                          groupings.get(key)!.push({ ...item, absenceType });
                        });

                        if (groupings.size === 0) return null;

                        const firstGroup = Array.from(groupings.values())[0];
                        firstGroup.sort((a, b) =>
                          (a.start || "").localeCompare(b.start || ""),
                        );

                        const parseDate = (dstr: string) => {
                          const [y, m, d] = dstr.split("-").map(Number);
                          return new Date(y, m - 1, d);
                        };

                        const currentChunk = [firstGroup[0]];
                        for (let i = 1; i < firstGroup.length; i++) {
                          const curr = firstGroup[i];
                          const prev = currentChunk[currentChunk.length - 1];
                          const currDate = parseDate(curr.start);
                          const prevDate = parseDate(prev.start);

                          const diffTime = Math.abs(
                            currDate.getTime() - prevDate.getTime(),
                          );
                          const diffDays = Math.ceil(
                            diffTime / (1000 * 60 * 60 * 24),
                          );

                          if (diffDays === 1) {
                            currentChunk.push(curr);
                          } else {
                            break;
                          }
                        }

                        const chunk = currentChunk;
                        const minStart = chunk[0].start;
                        const maxEnd =
                          chunk[chunk.length - 1].end ||
                          chunk[chunk.length - 1].start;
                        const comment = chunk[0].comment;
                        const absenceType = chunk[0].absenceType;

                        const registrations = chunk.map((r) => {
                          let unitStr = "Hours";
                          if (
                            r.billingMode &&
                            r.billingMode.toLowerCase() === "days"
                          )
                            unitStr = "Days";
                          return {
                            date: r.start,
                            account: {
                              id: r.accountId,
                              costs: [
                                {
                                  value: Number(r.cost),
                                  unit: { type: unitStr },
                                },
                              ],
                            },
                          };
                        });

                        const chunkDates = chunk.map((r: any) => r.start);
                        const chunkEmpId = chunk[0].employeeId;
                        const oldNoteMatch = oldNotesDataRef.current.find(n => 
                            n.empId === chunkEmpId && n.note && chunkDates.some((d: string) => d >= n.start && d <= n.end)
                        );
                        const oldNoteStr = oldNoteMatch ? oldNoteMatch.note : "";

                        return {
                          employeeId: chunk[0].employeeId,
                          note: updateMethod === "migrate"
                            ? `Migrated via API from: “${chunk[0].originalAccountName}”${oldNoteStr ? ` - Note: ${oldNoteStr}` : ""}${comment ? ` - ${comment}` : ""}`
                            : (comment
                              ? `${comment} - Bulk requested via API`
                              : "Bulk requested via API"),
                          absenceType: absenceType,
                          absencePeriod: {
                            start: minStart,
                            end: maxEnd,
                          },
                          registrations: registrations,
                        };
                      })(),
                      null,
                      2,
                    )}
                  </pre>
                </div>
              )}

              {/* Pagination Footer */}

              <div className="flex items-center justify-start gap-6 mt-4 text-sm text-slate-700">
                <div className="flex items-center border border-gray-300 rounded-md shadow-sm bg-white h-9">
                  <button
                    onClick={() => setReviewPage((p) => Math.max(1, p - 1))}
                    disabled={reviewPage === 1}
                    className="px-3 h-full hover:bg-gray-50 border-r border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-slate-500"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                  <span className="px-4 h-full flex items-center font-bold whitespace-nowrap min-w-[7rem] justify-center text-slate-800">
                    Page {reviewPage} of{" "}
                    {reviewRowsPerPage === "All"
                      ? 1
                      : Math.ceil(sortedReviews.length / reviewRowsPerPage) ||
                        1}
                  </span>
                  <button
                    onClick={() =>
                      setReviewPage((p) =>
                        Math.min(
                          Math.ceil(
                            sortedReviews.length /
                              (reviewRowsPerPage as number),
                          ),
                          p + 1,
                        ),
                      )
                    }
                    disabled={
                      reviewRowsPerPage === "All" ||
                      reviewPage ===
                        Math.ceil(sortedReviews.length / reviewRowsPerPage) ||
                      sortedReviews.length === 0
                    }
                    className="px-3 h-full hover:bg-gray-50 border-l border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-slate-500"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>

                <div className="flex items-center gap-2 font-medium text-slate-600">
                  <span>Rows per page:</span>
                  <div className="relative flex items-center">
                    <select
                      value={reviewRowsPerPage}
                      onChange={(e) => {
                        const val =
                          e.target.value === "All"
                            ? "All"
                            : Number(e.target.value);
                        setReviewRowsPerPage(val);
                        setReviewPage(1);
                      }}
                      className="appearance-none bg-transparent border-none focus:ring-0 focus:outline-none pr-5 cursor-pointer text-slate-800 font-medium"
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                      <option value="All">All</option>
                    </select>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 absolute right-0 pointer-events-none text-slate-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>

                <div className="font-medium text-slate-600">
                  Showing{" "}
                  {sortedReviews.length === 0
                    ? 0
                    : reviewRowsPerPage === "All"
                      ? 1
                      : (reviewPage - 1) * reviewRowsPerPage + 1}{" "}
                  to{" "}
                  {reviewRowsPerPage === "All" || sortedReviews.length === 0
                    ? sortedReviews.length
                    : Math.min(
                        reviewPage * reviewRowsPerPage,
                        sortedReviews.length,
                      )}{" "}
                  of {sortedReviews.length} results
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="flex justify-end space-x-4 items-center">
                  <button
                    onClick={() => setShowBackConfirmModal(true)}
                    disabled={isLoading.submitting}
                    className="bg-white hover:bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-md border border-gray-300 shadow-sm disabled:opacity-50"
                  >
                    &larr; Back
                  </button>
                  <button
                    onClick={() => setShowConfirmModal(true)}
                    disabled={
                      isLoading.submitting ||
                      adjustmentsToReview.length === 0 ||
                      totalTableErrors > 0
                    }
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md disabled:bg-gray-400"
                  >
                    {updateMethod === "migrate" ? "Migrate Requests" : "Send Requests"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentStep === "processing" && (
            <div className="bg-white p-8 rounded-lg shadow-md max-w-[896px] mx-auto text-center">
              <h2 className="text-2xl font-bold mb-6 text-gray-800">
                {updateMethod === "migrate" ? "Migrating Requests" : "Processing Uploads"}
              </h2>
              <div className="py-8">
                <ProgressBar
                  progress={progress}
                  text={loadingText || `Processing (${Math.round(progress)}%)...`}
                />

                <div className="flex justify-center gap-8 mt-6">
                  {processingPhase >= 2 ? (
                    <>
                      <div className="text-green-600 font-bold text-lg">
                        Successful:{" "}
                        {
                          adjustmentsToReview.filter((a) => a.status === "success")
                            .length
                        }
                      </div>
                      <div className="text-red-600 font-bold text-lg">
                        Failed:{" "}
                        {
                          adjustmentsToReview.filter((a) => a.status === "error")
                            .length
                        }
                      </div>
                    </>
                  ) : processingPhase >= 1 ? (
                    <>
                      <div className="text-green-600 font-bold text-lg">
                        Successfully Denied: {step1SuccessCount}
                      </div>
                      <div className="text-red-600 font-bold text-lg">
                        Failed to Deny: {step1ErrorCount}
                      </div>
                    </>
                  ) : (
                    <div className="text-blue-600 font-bold text-lg animate-pulse">
                      Processing old requests...
                    </div>
                  )}
                </div>

                {processingLogs.length > 0 && (
                  <div className="mt-8 text-left bg-gray-900 text-gray-100 p-4 rounded-md h-64 overflow-y-auto font-mono text-sm shadow-inner">
                    {processingLogs.map((log, idx) => (
                      <div key={idx} className={`mb-1 ${log.type === "error" ? "text-red-400" : log.type === "success" ? "text-green-400" : "text-blue-300"}`}>
                        <span className="opacity-50 mr-2">[{new Date().toLocaleTimeString()}]</span>
                        {log.message}
                      </div>
                    ))}
                  </div>
                )}

                {processingPhase === 1.5 && proceedToStep2 && (
                  <div className="mt-8 flex justify-center animate-bounce">
                    <button
                      onClick={proceedToStep2}
                      className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-md shadow-lg transition-colors text-lg"
                    >
                      Proceed to Step 2 &rarr;
                    </button>
                  </div>
                )}

                {processingPhase !== 1.5 && (
                  <div className="mt-6 text-amber-600 text-sm font-semibold flex items-center justify-center animate-pulse">
                    <ExclamationIcon className="w-5 h-5 mr-1" />
                    ⚠️ Please keep this tab active and do not let your computer sleep.
                  </div>
                )}

                <div className="mt-8 flex justify-center">
                  <button
                    onClick={() => setShowAbortModal(true)}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-md shadow transition-colors"
                  >
                    Abort Process
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentStep === "summary" && (
            <div className="bg-white p-8 rounded-lg shadow-md max-w-[1024px] mx-auto text-center">
              <h2 className="text-2xl font-bold mb-6 text-gray-800">
                Upload summary
              </h2>
              <div className="flex justify-around text-center my-8">
                <div>
                  <p className="text-5xl font-bold text-green-500">
                    {updateSummary.filter((s) => s.status === "success").length}
                  </p>
                  <p className="text-gray-500 mt-1">Successful</p>
                </div>
                <div>
                  <p className="text-5xl font-bold text-red-500">
                    {updateSummary.filter((s) => s.status === "error").length}
                  </p>
                  <p className="text-gray-500 mt-1">Failed</p>
                </div>
              </div>

              <div className="flex justify-between items-center mt-8 mb-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  Detailed Results
                </h3>
              </div>

              <div className="max-h-[800px] overflow-y-auto border rounded-lg shadow-inner">
                <table className="w-full text-sm text-left relative">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th
                        scope="col"
                        className="px-4 py-3 align-middle text-left"
                      >
                        Employee
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 align-middle text-left"
                      >
                        {updateMethod === "migrate" ? "From Account" : "Account"}
                      </th>
                      {updateMethod === "migrate" && (
                        <th
                          scope="col"
                          className="px-4 py-3 align-middle text-left"
                        >
                          To Account
                        </th>
                      )}
                      <th
                        scope="col"
                        className="px-4 py-3 align-middle text-left w-32"
                      >
                        Date
                      </th>
                      <th
                        scope="col"
                        className="px-2 py-3 align-middle text-left w-24"
                      >
                        Cost
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 align-middle text-left w-24"
                      >
                        Unit
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 align-middle text-left"
                      >
                        Comment
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 align-middle text-left w-32"
                      >
                        Status
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 align-middle text-left w-48"
                      >
                        Result Message
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSummary.map((s, idx) => {
                      const showSeparator = s.isRequestStart || idx === 0;
                      const fromDate = s.requestStartDate ? formatDateForDisplay(s.requestStartDate, downloadDateFormat) : "";
                      const toDate = s.requestEndDate ? formatDateForDisplay(s.requestEndDate, downloadDateFormat) : "";
                      const dateRangeText = fromDate === toDate 
                        ? `Leave Request ${fromDate}`
                        : `Leave Request ${fromDate} - ${toDate}`;

                      return (
                        <React.Fragment key={s.id}>
                          {showSeparator && (
                            <tr>
                              <td
                                colSpan={updateMethod === "migrate" ? 9 : 8}
                                className="text-center py-2 bg-gray-100 text-gray-500 font-medium text-sm border-y border-gray-200"
                              >
                                {idx === 0 && !s.isRequestStart ? (
                                  <span className="italic">{dateRangeText} (continued)</span>
                                ) : (
                                  <span>{dateRangeText}</span>
                                )}
                              </td>
                            </tr>
                          )}
                          <tr
                            className={`border-b hover:bg-gray-50 ${s.status === "error" ? "bg-red-50" : s.status === "skipped" ? "bg-amber-50" : "bg-white"}`}
                          >
                            <td className="px-4 py-3 font-medium text-gray-900 leading-tight">
                              <div className="flex items-center gap-1">
                                <span>{s.employeeName}</span>
                                {s.employeeMatchType === "exact" && (
                                  <div className="group/match relative inline-flex">
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover/match:opacity-100">
                                      Exact match by Salary ID and Name
                                    </div>
                                  </div>
                                )}
                                {s.employeeMatchType === "salary" && (
                                  <div className="group/match relative inline-flex">
                                    <CheckCircle2 className="w-4 h-4 text-purple-500" />
                                    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-pre-wrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover/match:opacity-100 text-center w-64">
                                      Matched via Salary ID{"\n"}The employee name in the file differs from the name in the portal: {s.portalEmployeeName}
                                    </div>
                                  </div>
                                )}
                                {s.employeeMatchType === "name" && (
                                  <div className="group/match relative inline-flex">
                                    <CheckCircle2 className="w-4 h-4 text-orange-500" />
                                    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-pre-wrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover/match:opacity-100 text-center w-64">
                                      Matched via Name{"\n"}The Salary/Payroll ID in the file differs from the ID in the portal: {s.portalSalaryIdentifier || 'N/A'}
                                    </div>
                                  </div>
                                )}
                                {s.employeeMatchType === "none" && (
                                  <div className="group/match relative inline-flex">
                                    <XCircle className="w-4 h-4 text-red-500" />
                                    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-pre-wrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover/match:opacity-100 text-center w-48">
                                      Employee not found{"\n"}Try find the employee inside the portal and check the name and salary/payroll ID
                                    </div>
                                  </div>
                                )}
                              </div>
                              {s.salaryIdentifier && (
                                <div className="text-xs font-mono text-gray-500 mt-0.5">
                                  SID: {s.salaryIdentifier}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {s.accountName}
                              {(s.spendingPeriod || s.validityPeriod) && (
                                <div className="text-xs text-gray-500 mt-1 whitespace-nowrap">
                                  Valid:{" "}
                                  {formatDateForDisplay(
                                    (s.spendingPeriod || s.validityPeriod)
                                      ?.start,
                                    downloadDateFormat
                                  )}{" "}
                                  to{" "}
                                  {formatDateForDisplay(
                                    (s.spendingPeriod || s.validityPeriod)?.end,
                                    downloadDateFormat
                                  )}
                                </div>
                              )}
                            </td>
                            {updateMethod === "migrate" && (
                              <td className="px-4 py-3 align-middle">
                                {accountTypes.find(t => t.id === migrateToAccountId)?.name || "Unknown"}
                              </td>
                            )}
                            <td className="px-4 py-3 whitespace-nowrap align-middle">
                              {s.date || s.start ? formatDateForDisplay(s.date || s.start, downloadDateFormat) : ""}
                            </td>
                            <td className="px-2 py-3 align-middle font-mono">
                              {Number(
                                s.adjustment !== undefined
                                  ? s.adjustment
                                  : s.cost || 0,
                              ).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap align-middle">
                              {s.unit || s.billingMode || "N/A"}
                            </td>
                            <td
                              className="px-4 py-3 text-xs text-gray-500 truncate max-w-[200px] align-middle"
                              title={s.comment}
                            >
                              {s.comment}
                            </td>
                            <td className="px-4 py-3 text-xs align-middle text-gray-900">
                              {s.requestStatus || "Requested"}
                            </td>
                            <td
                              className={`px-4 py-3 text-xs align-middle ${s.status === "error" ? "text-red-600 font-semibold" : s.status === "skipped" ? "text-amber-600 font-semibold" : "text-green-600 font-semibold"}`}
                            >
                              {s.status === "error" || s.status === "skipped"
                                ? s.error
                                : "Uploaded Successfully"}
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end gap-3 flex-wrap">
                {updateSummary.some(s => s.status === "error") && (
                  <button
                    onClick={handleRetryFailed}
                    className="flex items-center bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-md"
                  >
                    Retry Failed Requests
                  </button>
                )}
                <button
                  onClick={handleExportResults}
                  className="flex items-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md"
                >
                  <DownloadIcon className="h-4 w-4 mr-2" /> Export Results
                </button>
                <button
                  onClick={handleStartOver}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md"
                >
                  Start New Process
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      <footer className="py-6 text-center">
        <div className="relative group inline-flex items-center gap-1 cursor-help">
          <span className="text-gray-500 text-sm font-medium">App Info</span>
          <InfoIcon className="h-4 w-4 text-gray-400 group-hover:text-blue-500" />
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 w-80 p-4 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 text-center leading-relaxed">
            <p className="mb-2">
              <strong>Client-Side Processing & Secure:</strong> This app is a
              React-based JavaScript web application that runs entirely in your
              browser.
            </p>
            <p className="mb-3">
              Your Excel files and employee data are processed locally in your
              browser and are never sent to any third‑party servers; they are
              only transmitted directly to the official{" "}
              <a
                href="https://openapi.planday.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-300 hover:text-blue-200 underline"
              >
                Planday Open API
              </a>{" "}
              over a secure encrypted connection (HTTPS).
            </p>
            <p className="text-gray-400 border-t border-gray-700 pt-2 mt-2">
              Version 1.1
            </p>
            <p className="text-gray-400">
              Made with ❤️ by the Planday Community
            </p>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      </footer>

      {/* Fixed Floating Tooltip Container */}
      {activeTooltip && (
        <div
          className="fixed z-[100] p-3 bg-gray-900 text-white text-xs font-normal normal-case rounded-md shadow-xl pointer-events-none transition-opacity duration-200"
          style={{
            top: activeTooltip.y,
            left: activeTooltip.x,
            transform: "translate(-50%, 0)",
          }}
        >
          {activeTooltip.content}
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-b-gray-900"></div>
        </div>
      )}

      {/* Back Confirmation Modal */}
      {showBackConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-[448px] w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Go Back?</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to go back? Any edits you have made to the
              table will not be saved.
            </p>
            <div className="flex justify-end gap-3 flex-col sm:flex-row">
              <button
                onClick={() => setShowBackConfirmModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowBackConfirmModal(false);
                  setCurrentStep(
                    updateMethod === "excel" ? "upload" : "configure",
                  );
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-bold"
              >
                Yes, Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Balance Modal */}
      {showUpdateBalanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-[600px] w-full shadow-xl">
            <h3 className="text-lg font-bold text-orange-600 mb-4">
              Update available balance?
            </h3>
            <p className="text-gray-600 mb-4 whitespace-pre-wrap">
              Since the table was generated based on your file upload, the
              current displayed balance may not reflect recent updates (e.g.,
              approved leave, accruals, manual requests, etc.) processed after
              the template file was generated. Click "Yes, update now" to ensure
              that they match.
              {"\n\n"}
              Note, that the app will have to fetch the account balances again
              which can take some time. Table edits and inputs will not change,
              however the adjustments will be recalculated based on the new
              potential difference between Available balance and New balance
              target.
            </p>
            <div className="flex justify-end gap-3 flex-col sm:flex-row">
              <button
                onClick={() => setShowUpdateBalanceModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md font-medium"
              >
                No, keep file dates
              </button>
              <button
                onClick={handleUpdateBalances}
                className="px-4 py-2 text-white bg-orange-500 hover:bg-orange-600 rounded-md font-bold"
              >
                Yes, update now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Updating Balances Loader UI */}
      {isUpdatingBalances && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-8 max-w-[600px] w-full shadow-xl text-center relative">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">
              Updating Balances
            </h2>
            <ProgressBar
              progress={progress}
              text={`${loadingText} (${Math.round(progress)}%)`}
            />
            <div className="mt-8">
              <button
                onClick={handleAbort}
                className="bg-red-100 hover:bg-red-200 text-red-700 font-semibold py-2 px-6 rounded-md shadow-sm transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-[448px] w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {updateMethod === "migrate" ? "Confirm Migration" : "Confirm Upload"}
            </h3>
            <div className="text-gray-600 mb-6">
              {updateMethod === "migrate" ? (
                <>
                  <p>
                    The migration process is about to start for{" "}
                    <span className="text-blue-600 font-semibold">
                      {reviewBundleCounts.total} requests
                    </span>.
                  </p>
                  <p className="mt-3 text-red-600 font-semibold">
                    Warning: Step 1 of the migration will permanently deny all leave requests within the selected period (both pending and approved) from the source accounts.
                  </p>
                  <p className="mt-3">
                    Are you sure you want to proceed?
                  </p>
                </>
              ) : (
                <>
                  The upload process is about to start for{" "}
                  <span className="text-blue-600 font-semibold">
                    {reviewBundleCounts.total} requests
                  </span>
                  . Have you reviewed the leave requests and are you ready to
                  proceed?
                </>
              )}
            </div>
            <div className="flex justify-end gap-3 flex-col sm:flex-row">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md font-medium"
              >
                Cancel
              </button>
              <button
                onClick={executeBatchUpdate}
                className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md font-bold"
              >
                Yes, start now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Modal */}
      {showRemoveConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-[448px] w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4 text-center">
              Remove Selected
            </h3>
            <p className="text-gray-600 mb-6 text-center">
              Are you sure you want to remove the{" "}
              <span className="font-bold text-gray-900">
                {selectedReviewIds.size}
              </span>{" "}
              selected leave request date(s) from the table?
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setShowRemoveConfirmModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-md font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveSelected}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-bold"
              >
                Remove Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stop Process Modal */}
      {showStopProcessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-[448px] w-full shadow-xl">
            <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center">
              <ExclamationIcon className="w-6 h-6 mr-2" />
              Stop Process?
            </h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to stop the current process? This will
              cancel the fetching of accounts.
            </p>
            <div className="flex justify-end gap-3 flex-col sm:flex-row">
              <button
                onClick={() => setShowStopProcessModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md font-medium"
              >
                No, keep going
              </button>
              <button
                onClick={() => {
                  abortRef.current = true;
                  setShowStopProcessModal(false);
                }}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-md font-bold"
              >
                Yes, stop process
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Failed Modal (Step 0) */}
      {validationFailedState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full shadow-xl">
            <h3 className="text-xl font-bold text-red-600 mb-4 flex items-center">
              <ExclamationIcon className="w-6 h-6 mr-2" />
              Missing Destination Accounts
            </h3>
            <div className="text-gray-700 mb-6 text-sm">
              <p className="mb-2">
                Some employees do not have a valid destination account for the dates being migrated.
              </p>
              <div className="bg-red-50 text-red-800 p-4 rounded max-h-40 overflow-y-auto font-mono text-xs mb-4">
                {validationFailedState.errors.map((e, i) => <div key={i} className="mb-1">{e}</div>)}
              </div>
              <p className="mb-4">
                <strong>Re-validate:</strong> Go to Planday and create the missing accounts, then click this button to check again.<br/>
                <strong>Skip employees:</strong> Proceed with migration, but skip the affected employees entirely (their old requests will remain untouched).<br/>
                <strong>Abort:</strong> Cancel the migration and return to the review step.
              </p>
            </div>
            <div className="flex justify-end gap-3 flex-col sm:flex-row">
              <button
                onClick={() => validationFailedState.resolve("abort")}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md font-medium"
              >
                Abort
              </button>
              <button
                onClick={() => validationFailedState.resolve("skip")}
                className="px-4 py-2 text-white bg-orange-500 hover:bg-orange-600 rounded-md font-bold"
              >
                Skip employees
              </button>
              <button
                onClick={() => validationFailedState.resolve("revalidate")}
                className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md font-bold"
              >
                Re-validate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Abort Modal */}
      {showAbortModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-[448px] w-full shadow-xl">
            <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center">
              <ExclamationIcon className="w-6 h-6 mr-2" />
              Abort Process?
            </h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to abort the upload process? This will
              cancel all remaining leave requests. The currently processing
              batch will finish, and remaining items will be marked as aborted
              in the results summary.
            </p>
            <div className="flex justify-end gap-3 flex-col sm:flex-row">
              <button
                onClick={() => setShowAbortModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md font-medium"
              >
                Continue Upload
              </button>
              <button
                onClick={() => {
                  setShowAbortModal(false);
                  handleAbort();
                }}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-md font-bold"
              >
                Yes, Abort
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Edit Notification Modal */}
      {bulkEditDateWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 transition-opacity">
          <div className="bg-white rounded-lg p-6 max-w-[500px] w-full shadow-2xl relative">
            <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
              <ExclamationIcon className="w-6 h-6 mr-2 text-amber-500" />
              Notice: Accounts without a Start Date
            </h3>
            <p className="text-gray-600 mb-6 leading-relaxed">
              The Account Start Date will not be applied to{" "}
              <span className="font-bold text-gray-900">
                {bulkEditDateWarning.skippedflexCount}
              </span>{" "}
              FLEX/TOIL account(s) you selected because they do not have a
              defined start date.
              <br />
              <br />
              It will be successfully applied to the remaining selected accounts
              that have a valid start date.
            </p>
            <div className="flex justify-end gap-3 flex-col sm:flex-row">
              <button
                onClick={() => setBulkEditDateWarning(null)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md font-medium transition-colors"
              >
                Apply different date
              </button>
              <button
                onClick={() => {
                  setBulkEditDateWarning(null);
                  executeApplyBulkEdit();
                }}
                className="px-5 py-2 text-white bg-green-600 hover:bg-green-700 rounded-md font-bold shadow-sm transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AuthStep: React.FC<{
  onAuthSuccess: (credentials: PlandayApiCredentials) => void;
}> = ({ onAuthSuccess }) => {
  return (
    <div className="grid md:grid-cols-2 gap-8 items-start max-w-[1152px] mx-auto">
      <CredentialsForm onSave={onAuthSuccess} />
      <HelpPanel />
    </div>
  );
};

const CredentialsForm: React.FC<{
  onSave: (credentials: PlandayApiCredentials) => void;
}> = ({ onSave }) => {
  const [refreshToken, setRefreshToken] = useState("");
  const [error, setError] = useState("");
  const APP_ID = "4cb66728-94bf-416b-8d6c-892e4d36b38e";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!refreshToken) {
      setError("Refresh token is required.");
      return;
    }
    setError("");
    onSave({ clientId: APP_ID, refreshToken });
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow-md border border-gray-200">
      <h2 className="text-2xl font-bold mb-2 text-gray-800">
        Connect to Planday
      </h2>
      <p className="text-gray-500 mb-6">
        Enter your Planday refresh token to connect with the App.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            className="block text-sm font-medium text-gray-700 mb-1"
            htmlFor="refreshToken"
          >
            Refresh Token
          </label>
          <input
            id="refreshToken"
            type="password"
            value={refreshToken}
            onChange={(e) => setRefreshToken(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter Refresh Token"
          />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={!refreshToken.trim()}
          className="w-full bg-blue-400 hover:bg-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-md focus:outline-none focus:shadow-outline transition duration-300"
        >
          Connect
        </button>
      </form>
    </div>
  );
};

const HelpPanel: React.FC = () => {
  const APP_ID = "4cb66728-94bf-416b-8d6c-892e4d36b38e";
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(APP_ID);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow-md border border-gray-200">
      <h2 className="text-2xl font-bold mb-2 text-gray-800">
        How to get your refresh token
      </h2>
      <p className="text-gray-500 mb-6">
        Follow these steps to generate the necessary credentials from your
        Planday portal.
      </p>
      <ol className="list-decimal list-inside space-y-3 text-gray-600">
        <li>Log in to your Planday portal</li>
        <li>Go to Settings &rarr; API Access</li>
        <li>
          Click "Connect APP" and connect to app:
          <div className="flex items-center gap-2 mt-1 p-2 bg-gray-100 rounded-md">
            <code className="text-sm text-gray-800 flex-grow">{APP_ID}</code>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-md hover:bg-gray-200 text-gray-500 hover:text-gray-800"
            >
              {copied ? (
                <CheckIcon className="h-5 w-5 text-green-600" />
              ) : (
                <CopyIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </li>
        <li>Authorize the app when prompted</li>
        <li>Copy the "Token" value (this is your Refresh Token)</li>
      </ol>
    </div>
  );
};

export default App;
