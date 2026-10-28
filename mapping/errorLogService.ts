import * as XLSX from "xlsx-js-style";
import { AdjustmentReview, Employee, AccountType } from "../types";
import { IdentityConfig, RowEmployeeMatch, ParsedFileResult } from "./types";

export type ErrorStage = "mapping" | "validation" | "update";

export interface ErrorLogItem {
  id: string;
  sourceRowNumber: number; // 1-based Excel row number (e.g. 2, 3...)
  stage: ErrorStage;
  stageLabel: string;
  employeeName: string;
  salaryIdentifier?: string;
  systemEmployeeId?: number;
  portalEmployeeName?: string;
  accountName: string;
  date?: string;
  cost?: number | string;
  billingMode?: string;
  requestStatus?: string;
  errorCategory: string;
  errorMessage: string;
  explanation: string;
  recommendedAction: string;
  timestamp?: string;
  rawRowData?: Record<string, any>;
}

/**
 * Categorize a validation error message into a human-friendly category and explanation
 */
export function categorizeValidationError(errorMsg: string): {
  category: string;
  explanation: string;
  recommendedAction: string;
} {
  const lower = (errorMsg || "").toLowerCase();

  if (lower.includes("unmapped employee") || lower.includes("employee not found")) {
    return {
      category: "Unmapped Employee",
      explanation:
        "The employee record in the spreadsheet could not be matched to an active Planday employee profile, or was left unmapped during the Employee Mapping stage. Planday requires a valid employee ID to create leave requests.",
      recommendedAction:
        "Go back to the Employee Mapping step to manually match this employee to their Planday account, or confirm the employee exists in Planday.",
    };
  }

  if (lower.includes("missing date") || lower.includes("no date") || lower.includes("invalid date")) {
    return {
      category: "Missing / Invalid Date",
      explanation:
        "The request row does not have a valid date or start date. Planday cannot record leave without a specific date.",
      recommendedAction:
        "Check the original spreadsheet date column. Ensure dates are formatted as DD/MM/YYYY (EU) or MM/DD/YYYY (US), or enter a valid date in the review table.",
    };
  }

  if (lower.includes("destination account not found") || lower.includes("missing destination account")) {
    return {
      category: "Missing Destination Account",
      explanation:
        "During account migration (Step 0 validation), no active destination leave account was found for this employee covering the requested period.",
      recommendedAction:
        "Ensure the employee has the destination leave account assigned in Planday with a valid period covering this date.",
    };
  }

  if (lower.includes("account not found") || lower.includes("account")) {
    return {
      category: "Leave Account Not Found",
      explanation:
        "No matching leave account in Planday was found for this employee and date. The employee might not have this account type assigned, or the account validity/spending period does not cover this date.",
      recommendedAction:
        "Verify that the leave account name matches Planday account types, and check that the employee has this leave account assigned with an active validity period.",
    };
  }

  if (lower.includes("cost cannot exceed 1 day")) {
    return {
      category: "Cost Exceeds 1 Day",
      explanation:
        "The request specifies days as unit, but the cost value is greater than 1. Planday day-based absence requests cannot exceed 1.0 day per day registration.",
      recommendedAction:
        "Reduce the cost to 1.0 or less, or split across multiple dates if the leave spans several days.",
    };
  }

  if (lower.includes("cost cannot exceed 24 hours")) {
    return {
      category: "Cost Exceeds 24 Hours",
      explanation:
        "The request specifies hours as unit, but the cost value exceeds 24 hours for a single day.",
      recommendedAction:
        "Adjust the cost to be 24 hours or fewer per day.",
    };
  }

  if (lower.includes("cost is required") || lower.includes("valid number")) {
    return {
      category: "Invalid / Missing Cost",
      explanation:
        "The leave cost is missing, empty, or not a valid numeric value.",
      recommendedAction:
        "Provide a positive numeric cost (e.g. 7.5 or 1) in the file or review table.",
    };
  }

  if (lower.includes("inconsistent status in sequential bundle") || lower.includes("mixed status")) {
    return {
      category: "Mixed Bundle Status",
      explanation:
        "Consecutive days bundled into a single absence request have conflicting statuses (e.g., some days marked Approved and others Requested). Planday absence requests must have a uniform status across all bundled days.",
      recommendedAction:
        "Ensure all consecutive days in the same request period have the same status (Approved, Requested, or Denied).",
    };
  }

  if (lower.includes("inconsistent unit type")) {
    return {
      category: "Mixed Bundle Unit",
      explanation:
        "Consecutive days bundled together use different unit types (e.g. mixing Hours and Days). All registrations in one request must share the same unit.",
      recommendedAction:
        "Align the billing units so all days in the bundle use either Hours or Days.",
    };
  }

  if (lower.includes("abort")) {
    return {
      category: "Aborted by User",
      explanation: "The update process was cancelled by the user before this request could be submitted.",
      recommendedAction: "Restart the upload process and allow it to finish without aborting.",
    };
  }

  return {
    category: "Validation Issue",
    explanation: errorMsg || "The request did not pass pre-flight validation rules and was skipped.",
    recommendedAction: "Review and correct the row data before resending.",
  };
}

/**
 * Categorize API update error message
 */
export function categorizeApiError(errorMsg: string): {
  category: string;
  explanation: string;
  recommendedAction: string;
} {
  const lower = (errorMsg || "").toLowerCase();

  if (lower.includes("overlap") || lower.includes("already has") || lower.includes("conflict")) {
    return {
      category: "Overlapping Absence Request",
      explanation:
        "Planday rejected this request because the employee already has an existing absence registration or conflicting leave request on this date.",
      recommendedAction:
        "Open Planday and check the employee's schedule. Delete or adjust existing conflicting absence entries before re-uploading.",
    };
  }

  if (lower.includes("balance") || lower.includes("insufficient") || lower.includes("exceed")) {
    return {
      category: "Insufficient Balance",
      explanation:
        "The employee does not have sufficient leave account balance for this request, or the account settings prevent negative balances.",
      recommendedAction:
        "Check the employee's available balance in Planday or adjust the account settings to permit negative balances if intended.",
    };
  }

  if (lower.includes("unauthorized") || lower.includes("401") || lower.includes("forbidden") || lower.includes("403")) {
    return {
      category: "Authentication / Permission Error",
      explanation:
        "The Planday API rejected the request due to missing permissions or an expired session.",
      recommendedAction:
        "Reconnect to Planday with an account that has Absence Management administrator permissions.",
    };
  }

  if (lower.includes("not found") || lower.includes("404")) {
    return {
      category: "Employee or Account Not Found",
      explanation:
        "The employee ID or leave account ID referenced does not exist or has been deleted in Planday.",
      recommendedAction:
        "Ensure the employee and leave account are still active in Planday.",
    };
  }

  if (lower.includes("abort")) {
    return {
      category: "Aborted by User",
      explanation: "The process was stopped by user request before this request was sent.",
      recommendedAction: "Retry the request.",
    };
  }

  return {
    category: "Planday API Error",
    explanation:
      errorMsg || "Planday Open API returned an error when attempting to create this absence request.",
    recommendedAction:
      "Verify employee active status and leave account configuration in Planday, then retry.",
  };
}

/**
 * Generate an ErrorLogItem from an unmapped spreadsheet row
 */
export function createUnmappedErrorLogItem(
  row: Record<string, any>,
  rowIndex: number,
  identityConfig: IdentityConfig | null,
  fieldMapping: Map<string, string>,
  reason?: string
): ErrorLogItem {
  const sourceRowNumber = rowIndex + 2; // Excel row (1-indexed + header)

  let employeeName = "Unmapped Employee";
  let salaryId = "";

  if (identityConfig) {
    if (identityConfig.method === "system_id" && identityConfig.idColumn) {
      const rawId = String(row[identityConfig.idColumn] ?? "").trim();
      const crossName = identityConfig.crossCheckNameColumn
        ? String(row[identityConfig.crossCheckNameColumn] ?? "").trim()
        : "";
      employeeName = crossName ? `${crossName} (ID: ${rawId})` : rawId ? `Employee ID ${rawId}` : "Missing ID";
    } else if (identityConfig.method === "salary_and_name") {
      salaryId = identityConfig.salaryIdColumn ? String(row[identityConfig.salaryIdColumn] ?? "").trim() : "";
      if (identityConfig.nameFormat === "split") {
        const fn = identityConfig.firstNameColumn ? String(row[identityConfig.firstNameColumn] ?? "").trim() : "";
        const ln = identityConfig.lastNameColumn ? String(row[identityConfig.lastNameColumn] ?? "").trim() : "";
        employeeName = `${fn} ${ln}`.trim() || "Missing Name";
      } else if (identityConfig.fullNameColumn) {
        employeeName = String(row[identityConfig.fullNameColumn] ?? "").trim() || "Missing Name";
      }
    }
  }

  // Extract other field values if columns were mapped or common headers exist
  let accountName = "Unknown Account";
  let date = "";
  let cost: string | number = "";
  let billingMode = "";
  let comment = "";

  for (const [col, target] of fieldMapping.entries()) {
    const val = row[col];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      if (target === "accountName") accountName = String(val).trim();
      if (target === "date" || target === "start") date = String(val).trim();
      if (target === "cost") cost = val;
      if (target === "billingMode" || target === "unit") billingMode = String(val).trim();
      if (target === "comment") comment = String(val).trim();
    }
  }

  // Fallbacks if not mapped
  if (accountName === "Unknown Account" && (row["Account"] || row["Account Name"] || row["Leave Type"])) {
    accountName = String(row["Account"] || row["Account Name"] || row["Leave Type"]).trim();
  }
  if (!date && (row["Date"] || row["Start Date"] || row["Start"])) {
    date = String(row["Date"] || row["Start Date"] || row["Start"]).trim();
  }
  if (!cost && (row["Cost"] || row["Hours"] || row["Days"] || row["Value"])) {
    cost = row["Cost"] || row["Hours"] || row["Days"] || row["Value"];
  }

  const detailedReason = reason || "No matching Planday employee profile found or row skipped during Employee Mapping stage.";

  return {
    id: `err-unmapped-${rowIndex}-${Date.now()}`,
    sourceRowNumber,
    stage: "mapping",
    stageLabel: "1. Employee Mapping",
    employeeName,
    salaryIdentifier: salaryId || undefined,
    systemEmployeeId: undefined,
    portalEmployeeName: undefined,
    accountName,
    date: date || undefined,
    cost: cost !== "" ? cost : undefined,
    billingMode: billingMode || undefined,
    requestStatus: "Not Sent (Unmapped)",
    errorCategory: "Unmapped Employee",
    errorMessage: detailedReason,
    explanation:
      "This row was not submitted because the employee in the file was not mapped to any Planday employee profile during the Employee Mapping stage. Planday API requires a valid employee ID to create leave requests.",
    recommendedAction:
      "Go to Step 3 (Employee Mapping) and assign this row to a Planday employee, or check if the employee exists in Planday with matching Name or Salary ID.",
    rawRowData: row,
  };
}

/**
 * Generate an ErrorLogItem from an AdjustmentReview that had validation issues or was skipped
 */
export function createValidationReviewErrorLogItem(
  review: AdjustmentReview,
  sourceRowNumber?: number
): ErrorLogItem {
  const rowNum = sourceRowNumber || (review as any).sourceRowNumber || 0;
  const rawError = review.error || "Validation issue detected";
  const { category, explanation, recommendedAction } = categorizeValidationError(rawError);

  return {
    id: `err-val-${review.id}`,
    sourceRowNumber: rowNum,
    stage: "validation",
    stageLabel: "2. Data Normalization & Validation",
    employeeName: review.employeeName || "Unknown",
    salaryIdentifier: review.salaryIdentifier || undefined,
    systemEmployeeId: review.employeeId,
    portalEmployeeName: review.portalEmployeeName,
    accountName: review.accountName || "Unknown",
    date: review.date || review.start || undefined,
    cost: review.cost !== undefined ? review.cost : review.adjustment,
    billingMode: review.billingMode || review.unit,
    requestStatus: review.requestStatus || "Requested",
    errorCategory: category,
    errorMessage: rawError,
    explanation,
    recommendedAction,
    timestamp: review.timestamp,
  };
}

/**
 * Generate an ErrorLogItem from a failed update attempt
 */
export function createUpdateErrorLogItem(
  review: AdjustmentReview,
  sourceRowNumber?: number
): ErrorLogItem {
  const rowNum = sourceRowNumber || (review as any).sourceRowNumber || 0;
  const rawError = review.error || "Failed during Planday API update";
  const { category, explanation, recommendedAction } = categorizeApiError(rawError);

  return {
    id: `err-upd-${review.id}`,
    sourceRowNumber: rowNum,
    stage: "update",
    stageLabel: "3. Update Execution / API",
    employeeName: review.employeeName || "Unknown",
    salaryIdentifier: review.salaryIdentifier || undefined,
    systemEmployeeId: review.employeeId,
    portalEmployeeName: review.portalEmployeeName,
    accountName: review.accountName || "Unknown",
    date: review.date || review.start || undefined,
    cost: review.cost !== undefined ? review.cost : review.adjustment,
    billingMode: review.billingMode || review.unit,
    requestStatus: review.requestStatus || "Requested",
    errorCategory: category,
    errorMessage: rawError,
    explanation,
    recommendedAction,
    timestamp: review.timestamp || new Date().toLocaleString(),
  };
}

/**
 * Compile a master unified Error Log Report from all workflow stages
 */
export function compileMasterErrorLog(
  uploadedFileData: ParsedFileResult | null,
  employeeMapping: Map<number, number | null>,
  fieldMapping: Map<string, string>,
  identityConfig: IdentityConfig | null,
  skippedOrDeletedValidationReviews: AdjustmentReview[],
  currentAdjustments: AdjustmentReview[],
  updateSummary: AdjustmentReview[]
): ErrorLogItem[] {
  const masterLog: ErrorLogItem[] = [];
  const processedKeys = new Set<string>();

  // 1. STAGE: Employee Mapping (Unmapped rows from uploaded file)
  if (uploadedFileData && uploadedFileData.rows.length > 0) {
    uploadedFileData.rows.forEach((row, rowIndex) => {
      const empId = employeeMapping.get(rowIndex);
      if (!empId) {
        // Unmapped or skipped in employee mapper
        const item = createUnmappedErrorLogItem(row, rowIndex, identityConfig, fieldMapping);
        const key = `mapping-row-${item.sourceRowNumber}`;
        if (!processedKeys.has(key)) {
          processedKeys.add(key);
          masterLog.push(item);
        }
      }
    });
  }

  // 2. STAGE: Data Normalization & Validation (Skipped or deleted due to errors)
  // A) From skipped/deleted cache
  skippedOrDeletedValidationReviews.forEach((review) => {
    const item = createValidationReviewErrorLogItem(review);
    const key = `val-${review.id}`;
    if (!processedKeys.has(key)) {
      processedKeys.add(key);
      masterLog.push(item);
    }
  });

  // B) From review rows that have validation errors
  currentAdjustments.forEach((review) => {
    if (review.isValidationError || (review.error && review.status !== "error")) {
      const item = createValidationReviewErrorLogItem(review);
      const key = `val-${review.id}`;
      if (!processedKeys.has(key)) {
        processedKeys.add(key);
        masterLog.push(item);
      }
    }
  });

  // 3. STAGE: Update Execution / API Failures & Skipped during update
  updateSummary.forEach((review) => {
    if (review.status === "error" || review.status === "skipped") {
      const isValidationType =
        review.isValidationError ||
        (review.error &&
          (review.error.toLowerCase().includes("missing destination") ||
            review.error.toLowerCase().includes("skipped during step 0") ||
            review.error.toLowerCase().includes("cost cannot exceed") ||
            review.error.toLowerCase().includes("missing date") ||
            review.error.toLowerCase().includes("account not found")));

      const item = isValidationType
        ? createValidationReviewErrorLogItem(review)
        : createUpdateErrorLogItem(review);

      const key = `summary-${review.id}`;
      if (!processedKeys.has(key)) {
        processedKeys.add(key);
        masterLog.push(item);
      }
    }
  });

  // Sort master log: Stage ascending (1, 2, 3), then by Source Row Number ascending
  const stageOrder: Record<ErrorStage, number> = {
    mapping: 1,
    validation: 2,
    update: 3,
  };

  masterLog.sort((a, b) => {
    if (stageOrder[a.stage] !== stageOrder[b.stage]) {
      return stageOrder[a.stage] - stageOrder[b.stage];
    }
    return (a.sourceRowNumber || 0) - (b.sourceRowNumber || 0);
  });

  return masterLog;
}

/**
 * Export Styled Error Log Report Spreadsheet (.xlsx)
 */
export function exportErrorLogReportToExcel(
  errorLogItems: ErrorLogItem[],
  totalProcessedOrFileRows?: number,
  dateFormatPreference: "EU" | "US" = "EU"
): void {
  const headers = [
    "Source Row #",
    "Workflow Stage",
    "Error Category",
    "Employee (File)",
    "Salary ID (File)",
    "Planday Employee",
    "Planday Employee ID",
    "Leave Account",
    "Date / Period",
    "Cost",
    "Unit",
    "Specific Error Message",
    "Why Request Was Not Sent (Explanation)",
    "Recommended Action to Fix",
  ];

  const data = errorLogItems.map((item) => {
    return {
      "Source Row #": item.sourceRowNumber > 0 ? `Row ${item.sourceRowNumber}` : "N/A",
      "Workflow Stage": item.stageLabel,
      "Error Category": item.errorCategory,
      "Employee (File)": item.employeeName || "Unknown",
      "Salary ID (File)": item.salaryIdentifier || "",
      "Planday Employee": item.portalEmployeeName || (item.systemEmployeeId ? `ID: ${item.systemEmployeeId}` : "Unmapped / None"),
      "Planday Employee ID": item.systemEmployeeId ? String(item.systemEmployeeId) : "",
      "Leave Account": item.accountName || "Unknown",
      "Date / Period": item.date || "N/A",
      "Cost": item.cost !== undefined ? item.cost : "",
      "Unit": item.billingMode || "",
      "Specific Error Message": item.errorMessage || "",
      "Why Request Was Not Sent (Explanation)": item.explanation,
      "Recommended Action to Fix": item.recommendedAction,
    };
  });

  const ws = XLSX.utils.json_to_sheet(data, { header: headers });

  // Range and border styling
  if (ws["!ref"]) {
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const borderStyle = {
      top: { style: "thin", color: { rgb: "E5E7EB" } },
      bottom: { style: "thin", color: { rgb: "E5E7EB" } },
      left: { style: "thin", color: { rgb: "E5E7EB" } },
      right: { style: "thin", color: { rgb: "E5E7EB" } },
    };

    const stageIdx = headers.indexOf("Workflow Stage");
    const categoryIdx = headers.indexOf("Error Category");
    const explanationIdx = headers.indexOf("Why Request Was Not Sent (Explanation)");
    const actionIdx = headers.indexOf("Recommended Action to Fix");

    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ c: C, r: R });
        if (!ws[cellAddress]) continue;

        if (!ws[cellAddress].s) ws[cellAddress].s = {};
        ws[cellAddress].s.border = borderStyle;

        if (R === 0) {
          // Header Row: Deep Navy #0F172A, bold white text
          ws[cellAddress].s.fill = { fgColor: { rgb: "0F172A" } };
          ws[cellAddress].s.font = {
            bold: true,
            color: { rgb: "FFFFFF" },
            name: "Segoe UI",
            sz: 11,
          };
          ws[cellAddress].s.alignment = { vertical: "center", horizontal: "center" };
        } else {
          // Alternating soft zebra or color coding
          const isEven = R % 2 === 0;
          ws[cellAddress].s.font = { name: "Segoe UI", sz: 10 };
          ws[cellAddress].s.alignment = { vertical: "center", wrapText: true };

          if (isEven) {
            ws[cellAddress].s.fill = { fgColor: { rgb: "F8FAFC" } };
          }

          // Stage styling
          if (C === stageIdx) {
            const cellVal = String(ws[cellAddress].v);
            if (cellVal.includes("Mapping")) {
              ws[cellAddress].s.font = { bold: true, color: { rgb: "6D28D9" }, name: "Segoe UI", sz: 10 }; // Purple
            } else if (cellVal.includes("Validation")) {
              ws[cellAddress].s.font = { bold: true, color: { rgb: "B45309" }, name: "Segoe UI", sz: 10 }; // Amber
            } else {
              ws[cellAddress].s.font = { bold: true, color: { rgb: "DC2626" }, name: "Segoe UI", sz: 10 }; // Red
            }
          }

          // Category styling
          if (C === categoryIdx) {
            ws[cellAddress].s.font = { bold: true, color: { rgb: "1E293B" }, name: "Segoe UI", sz: 10 };
          }
        }
      }
    }

    // Set column widths
    ws["!cols"] = [
      { wch: 14 }, // Row #
      { wch: 28 }, // Stage
      { wch: 24 }, // Category
      { wch: 24 }, // Employee File
      { wch: 16 }, // Salary ID
      { wch: 24 }, // Planday Employee
      { wch: 18 }, // Planday Employee ID
      { wch: 22 }, // Leave Account
      { wch: 16 }, // Date
      { wch: 10 }, // Cost
      { wch: 10 }, // Unit
      { wch: 32 }, // Specific error
      { wch: 55 }, // Explanation
      { wch: 50 }, // Recommended action
    ];
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Error Log Report");

  const today = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `Planday_Leave_Requests_Error_Log_Report_${today}.xlsx`);
}
