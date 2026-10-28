import { Employee, AccountType, LeaveAccount, AdjustmentReview } from "../types";
import { TargetFieldDefinition, IdentityConfig } from "./types";
import { DEFAULT_TARGET_FIELDS } from "./FieldMapper";
import { normalizeString } from "./similarity";

export interface ColumnDetectionResult {
  format: "EU" | "US";
  source: "detected" | "fallback" | "inherited" | "empty";
  hasConflict: boolean;
  conflictDetails: string[];
}

/**
 * Stage 2: Column Date Format Detection (detectColumnFormat)
 * Scans the entire column for unambiguous rows:
 * - Unambiguous US (MM/DD/YYYY): First number <= 12 and second number > 12 (e.g. 04/25/2025)
 * - Unambiguous EU (DD/MM/YYYY): First number > 12 and second number <= 12 (e.g. 25/04/2025)
 * Flags intra-column conflicts and handles inheritance / fallback preference.
 */
export const detectColumnFormat = (
  rows: any[],
  columnKey: string,
  fallbackFormat: "EU" | "US" = "EU"
): ColumnDetectionResult => {
  const unambiguousUS: { row: number; val: string }[] = [];
  const unambiguousEU: { row: number; val: string }[] = [];
  let hasAnyDateLike = false;

  rows.forEach((row, index) => {
    const val = row[columnKey];
    if (val === undefined || val === null || val === "") return;
    if (typeof val === "string" && val.trim().toUpperCase() === "N/A") return;

    // Native Date or Serial Number -> date exists, not ambiguous text
    if (val instanceof Date || typeof val === "number" || /^\d{5}$/.test(String(val).trim())) {
      hasAnyDateLike = true;
      return;
    }

    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      hasAnyDateLike = true;
      return; // ISO YYYY-MM-DD is unambiguous
    }

    // Match DD/MM/YYYY or MM/DD/YYYY with /, ., or - separators
    const match = str.match(/(^|\b)(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2}|\d{4})\b/);
    if (match) {
      hasAnyDateLike = true;
      const p1 = parseInt(match[2], 10);
      const p2 = parseInt(match[3], 10);

      if (p1 === 0 || p2 === 0 || (p1 > 31 && p2 > 31)) return;

      if (p1 <= 12 && p2 > 12) unambiguousUS.push({ row: index + 2, val: str });
      if (p1 > 12 && p2 <= 12) unambiguousEU.push({ row: index + 2, val: str });
    }
  });

  // Conflicting formats in the same column
  if (unambiguousUS.length > 0 && unambiguousEU.length > 0) {
    return {
      format: fallbackFormat,
      source: "detected",
      hasConflict: true,
      conflictDetails: [
        ...unambiguousUS.slice(0, 2).map((i) => `Row ${i.row}: ${i.val} (US Format)`),
        ...unambiguousEU.slice(0, 2).map((i) => `Row ${i.row}: ${i.val} (EU Format)`),
      ],
    };
  }

  if (unambiguousUS.length > 0) {
    return { format: "US", source: "detected", hasConflict: false, conflictDetails: [] };
  }
  if (unambiguousEU.length > 0) {
    return { format: "EU", source: "detected", hasConflict: false, conflictDetails: [] };
  }
  if (!hasAnyDateLike) {
    return { format: fallbackFormat, source: "empty", hasConflict: false, conflictDetails: [] };
  }

  return { format: fallbackFormat, source: "fallback", hasConflict: false, conflictDetails: [] };
};

/**
 * Stage 3: Smart Date Parser (parseDateToIso)
 * Converts any cell value (Date object, raw Excel serial, ISO string, delimited text)
 * into a normalized YYYY-MM-DD string without timezone offset drift.
 */
export const parseDateToIso = (
  input: any,
  formatPreference: "EU" | "US" = "EU"
): string | null => {
  if (input === null || input === undefined || input === "") return null;

  // 1. Handle JS Date Objects (from cellDates: true)
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    // CRITICAL: Always use local getters (getFullYear, getMonth, getDate),
    // NOT toISOString() or getUTC*, which shifts dates across timezones!
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, "0");
    const d = String(input.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 2. Handle raw Excel serial numbers (e.g. 45382, 46204)
  if (typeof input === "number" || /^\d{5}$/.test(String(input).trim())) {
    const serial = parseInt(String(input), 10);
    if (serial > 20000 && serial < 80000) {
      // 25569 = days between Jan 1, 1900 (Excel epoch) and Jan 1, 1970 (Unix epoch)
      const dateObj = new Date(Math.round((serial - 25569) * 86400 * 1000));
      // Use UTC getters here because pure epoch time was calculated
      const y = dateObj.getUTCFullYear();
      const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
      const d = String(dateObj.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  const str = String(input).trim();
  if (!str) return null;

  // Sentinel values
  if (str.toUpperCase() === "N/A" || str.toUpperCase() === "NULL") return null;

  // 3. Handle ISO string format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return str;
  }

  // 4. Handle text formats (e.g., 01/07/2026, 1-4-25, 30.04.2025)
  const match = str.match(/(^|\b)(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2}|\d{4})\b/);
  if (match) {
    let p1 = parseInt(match[2], 10);
    let p2 = parseInt(match[3], 10);
    let year = parseInt(match[4], 10);

    // Support 2-digit year (assumes 2000s)
    if (year < 100) year += 2000;

    let day: number;
    let month: number;

    // Disambiguation
    if (p1 > 12 && p2 <= 12) {
      // Must be EU: Day first
      day = p1;
      month = p2;
    } else if (p1 <= 12 && p2 > 12) {
      // Must be US: Month first
      month = p1;
      day = p2;
    } else {
      // Both <= 12, adhere to format preference
      if (formatPreference === "US") {
        month = p1;
        day = p2;
      } else {
        day = p1;
        month = p2;
      }
    }

    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    // Strict calendar validation (prevents JavaScript date rolling, e.g. Feb 30th -> March 2nd)
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

/**
 * Backwards-compatible alias for parseDateToIso
 */
export const parseDateValue = parseDateToIso;

/**
 * Smart numeric parser: handles European comma decimals (12,50) and currency symbols ($12.50)
 */
export function parseNumericValue(input: any): number {
  if (input === null || input === undefined) return NaN;
  if (typeof input === "number") return input;

  let clean = String(input).trim();
  if (!clean) return NaN;

  // Remove common currency symbols and spaces
  clean = clean.replace(/[$€£kr¥\s]/g, "");

  // If European format with comma as decimal and dot as thousands (e.g. 1.250,50)
  if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(clean)) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d+,\d+$/.test(clean)) {
    // Simple 12,50
    clean = clean.replace(",", ".");
  }

  const parsed = parseFloat(clean);
  return isNaN(parsed) ? NaN : parsed;
}

/**
 * General field value parser based on type definition
 */
export function parseFieldValue(value: any, type: TargetFieldDefinition["type"]): any {
  if (value === null || value === undefined) return null;

  switch (type) {
    case "Numeric":
      return parseNumericValue(value);
    case "Date":
      return parseDateValue(value);
    case "Boolean":
      if (typeof value === "boolean") return value;
      const lower = String(value).trim().toLowerCase();
      return lower === "true" || lower === "yes" || lower === "1" || lower === "y";
    case "Dropdown":
    case "Text":
    default:
      return String(value).trim();
  }
}

/**
 * Build normalized payload and AdjustmentReview items from mapping results
 */
export function buildNormalizedReviewRecords(
  rows: Record<string, any>[],
  employeeMapping: Map<number, number | null>,
  fieldMapping: Map<string, string>,
  allEmployees: Employee[],
  accountTypes: AccountType[],
  employeeAccountsCache: Map<number, LeaveAccount[]>,
  dateFormatPreference: "EU" | "US" = "EU",
  identityConfig?: IdentityConfig
): AdjustmentReview[] {
  const reviews: AdjustmentReview[] = [];

  // Stage 2: Pre-scan and detect formats for all mapped Date columns across dataset
  const dateColumnFormats = new Map<string, ColumnDetectionResult>();
  let primaryDetectedFormat: "EU" | "US" | null = null;

  for (const [fileHeader, targetKey] of fieldMapping.entries()) {
    if (targetKey === "IGNORE" || targetKey === "IDENTITY_IGNORE") continue;
    const targetDef = DEFAULT_TARGET_FIELDS.find((f) => f.key === targetKey);
    if (targetDef && targetDef.type === "Date") {
      const colResult = detectColumnFormat(rows, fileHeader, dateFormatPreference);
      dateColumnFormats.set(fileHeader, colResult);
      if (colResult.source === "detected" && !colResult.hasConflict && !primaryDetectedFormat) {
        primaryDetectedFormat = colResult.format;
      }
    }
  }

  // Sibling inheritance: if one date column has an unambiguous format detected (e.g. EU),
  // ambiguous sibling date columns inherit that format
  if (primaryDetectedFormat) {
    for (const [fileHeader, result] of dateColumnFormats.entries()) {
      if (result.source === "fallback" || result.source === "empty") {
        dateColumnFormats.set(fileHeader, {
          ...result,
          format: primaryDetectedFormat,
          source: "inherited",
        });
      }
    }
  }

  rows.forEach((row, rowIndex) => {
    const employeeId = employeeMapping.get(rowIndex);
    if (!employeeId) {
      // Skipped or unmapped row
      return;
    }

    const emp = allEmployees.find((e) => e.id === employeeId);
    if (!emp) return;

    // Assemble payload updates
    const updates: Record<string, any> = {};
    const rowDateErrors: string[] = [];

    for (const [fileHeader, targetKey] of fieldMapping.entries()) {
      if (targetKey === "IGNORE" || targetKey === "IDENTITY_IGNORE") continue;
      const targetDef = DEFAULT_TARGET_FIELDS.find((f) => f.key === targetKey);
      const targetType = targetDef ? targetDef.type : "Text";
      const rawVal = row[fileHeader];

      if (targetType === "Date") {
        const colInfo = dateColumnFormats.get(fileHeader);
        const resolvedFormat = colInfo?.format || dateFormatPreference;

        if (colInfo?.hasConflict) {
          rowDateErrors.push(`Date format conflict in "${fileHeader}"`);
        }

        const parsedDate = parseDateToIso(rawVal, resolvedFormat);
        if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "" && String(rawVal).trim().toUpperCase() !== "N/A" && !parsedDate) {
          rowDateErrors.push(`Invalid date in "${fileHeader}" (${String(rawVal)})`);
        }
        updates[targetKey] = parsedDate;
      } else if (targetType === "Numeric") {
        updates[targetKey] = parseNumericValue(rawVal);
      } else {
        updates[targetKey] = parseFieldValue(rawVal, targetType);
      }
    }

    // Determine timing
    const singleDate = updates.date || null;
    const startDate = updates.start || singleDate || null;
    const endDate = updates.end || singleDate || startDate;

    // Cost
    let cost = typeof updates.cost === "number" ? updates.cost : parseNumericValue(updates.cost);
    if (!isNaN(cost)) {
      cost = Math.abs(cost);
    }

    // Account matching
    const rawAccountName = String(updates.accountName || row["Account"] || "Vacation").trim();
    const normalizeName = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const normAcc = normalizeName(rawAccountName);

    const matchedType = accountTypes.find(
      (t) => normalizeName(t.name) === normAcc
    );

    // Find employee's leave accounts
    const empAccounts = employeeAccountsCache.get(emp.id) || [];
    let matchedAccount: LeaveAccount | undefined = undefined;

    if (empAccounts.length > 0) {
      matchedAccount = empAccounts.find((a: any) => {
        let isMatch = false;
        if (matchedType && (a.typeId === matchedType.id || a.accountType?.id === matchedType.id)) {
          isMatch = true;
        }
        if (!isMatch && a.name && normalizeName(a.name) === normAcc) {
          isMatch = true;
        }
        if (!isMatch && a.accountType?.name && normalizeName(a.accountType.name) === normAcc) {
          isMatch = true;
        }
        if (!isMatch) return false;

        // Validity period check
        if (startDate && a.validityPeriod) {
          const rDate = new Date(startDate);
          const periodToUse = a.spendingPeriod || a.validityPeriod;
          const vStart = periodToUse.start ? new Date(periodToUse.start) : new Date(0);
          const vEnd = periodToUse.end ? new Date(periodToUse.end) : new Date(8640000000000000);
          return rDate >= vStart && rDate <= vEnd;
        }

        return true;
      });
    }

    // Billing mode
    let billingMode = String(updates.billingMode || "hours").toLowerCase();
    if (billingMode === "hour") billingMode = "hours";
    if (billingMode === "day") billingMode = "days";

    let billingModeError: string | undefined = undefined;

    // If account has an expected unit, auto-convert or check
    if (matchedType) {
      let expectedUnit = "";
      if (matchedType.spendingUnit?.type) expectedUnit = matchedType.spendingUnit.type;
      else if (matchedType.accruingRate?.unit?.type) expectedUnit = matchedType.accruingRate.unit.type;
      else if (typeof matchedType.unit === "string") expectedUnit = matchedType.unit;
      else if (matchedType.unit?.type) expectedUnit = matchedType.unit.type;

      if (expectedUnit) {
        if (billingMode && billingMode !== expectedUnit.toLowerCase()) {
          billingModeError = `Template unit is '${billingMode}'. Account expected '${expectedUnit}'. Auto-converted.`;
        }
        billingMode = expectedUnit.toLowerCase();
      }
    }

    // Validation errors
    const errors: string[] = [...rowDateErrors];
    if (!startDate) errors.push("Missing Date");
    if (!matchedAccount) errors.push("Account Not Found");
    if (isNaN(cost) || cost === null || cost === undefined) {
      errors.push("Cost is required");
    } else if (billingMode === "days" && cost > 1) {
      errors.push("Cost cannot exceed 1 day");
    } else if (billingMode === "hours" && cost > 24) {
      errors.push("Cost cannot exceed 24 hours");
    }

    // Request status
    let statusClean = String(updates.requestStatus || "Requested").toLowerCase();
    let finalRequestStatus = "Requested";
    if (statusClean === "approved") finalRequestStatus = "Approved";
    if (statusClean === "denied") finalRequestStatus = "Denied";

    // Entity resolution logic
    const isApiIdMethod = identityConfig?.method === "system_id";
    const portalName = `${emp.firstName} ${emp.lastName}`.trim();
    const portalSalId = emp.salaryIdentifier || null;

    let finalEmpName = portalName;
    let finalSalId = portalSalId;
    let employeeMatchType: "exact" | "salary" | "name" | "none" = "exact";

    if (!isApiIdMethod) {
      // When using salary identifier & employee name
      const rawFileSal = identityConfig?.salaryIdColumn
        ? String(row[identityConfig.salaryIdColumn] ?? "").trim()
        : "";
      let rawFileName = "";
      if (identityConfig?.nameFormat === "split") {
        const fn = identityConfig.firstNameColumn ? String(row[identityConfig.firstNameColumn] ?? "").trim() : "";
        const ln = identityConfig.lastNameColumn ? String(row[identityConfig.lastNameColumn] ?? "").trim() : "";
        rawFileName = `${fn} ${ln}`.trim();
      } else if (identityConfig?.fullNameColumn) {
        rawFileName = String(row[identityConfig.fullNameColumn] ?? "").trim();
      }

      finalEmpName = rawFileName || portalName;
      finalSalId = rawFileSal || portalSalId;

      const normFileSal = normalizeString(finalSalId);
      const normPortalSal = normalizeString(portalSalId);
      const normFileName = normalizeString(finalEmpName);
      const normPortalName = normalizeString(portalName);

      if (normFileSal && normPortalSal && normFileSal === normPortalSal && normFileName === normPortalName) {
        employeeMatchType = "exact";
      } else if (normFileSal && normPortalSal && normFileSal === normPortalSal) {
        employeeMatchType = "salary";
      } else if (normFileName === normPortalName) {
        employeeMatchType = "name";
      } else {
        employeeMatchType = "exact";
      }
    } else {
      // When using Employee API ID: name and salary identifier are fetched from Planday
      // and assumed as exact matches in the review table!
      finalEmpName = portalName;
      finalSalId = portalSalId;
      employeeMatchType = "exact";
    }

    const item: AdjustmentReview = {
      id: `adj-mapped-${rowIndex}-${Date.now()}`,
      employeeId: emp.id,
      employeeName: finalEmpName,
      portalEmployeeName: portalName,
      employeeMatchType: employeeMatchType,
      salaryIdentifier: finalSalId,
      portalSalaryIdentifier: portalSalId,
      accountId: matchedAccount ? matchedAccount.id : 0,
      accountTypeId: matchedAccount ? (matchedAccount.typeId || (matchedAccount as any).accountType?.id) : matchedType?.id,
      accountName: rawAccountName,
      accountStatus: matchedAccount?.status,
      validityPeriod: matchedAccount?.validityPeriod,
      spendingPeriod: matchedAccount?.spendingPeriod,
      date: singleDate || startDate || undefined,
      start: startDate || undefined,
      end: endDate || undefined,
      cost: isNaN(cost) ? 0 : cost,
      billingMode: billingMode || "hours",
      requestStatus: finalRequestStatus,
      comment: updates.comment ? String(updates.comment) : "",
      status: "pending",
      error: errors.length > 0 ? errors.join(" | ") : undefined,
      billingModeError,
      isValidationError: errors.length > 0,
      sourceRowNumber: rowIndex + 2,
      stage: "validation",
    };

    reviews.push(item);
  });

  return reviews;
}
