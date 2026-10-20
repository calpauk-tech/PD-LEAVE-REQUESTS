import { Employee, AccountType, LeaveAccount, AdjustmentReview } from "../types";
import { TargetFieldDefinition, IdentityConfig } from "./types";
import { DEFAULT_TARGET_FIELDS } from "./FieldMapper";
import { normalizeString } from "./similarity";

/**
 * Smart date parser: handles Excel serial numbers, ISO strings, EU (DD/MM/YYYY) and US (MM/DD/YYYY)
 */
export function parseDateValue(input: any, preferredFormat: "EU" | "US" = "EU"): string | null {
  if (input === null || input === undefined || input === "") return null;

  // 1. JS Date instance
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, "0");
    const d = String(input.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 2. Excel serial numbers (offset 25569)
  if (typeof input === "number" || /^\d{5}$/.test(String(input).trim())) {
    const serial = parseInt(String(input), 10);
    if (serial > 20000 && serial < 80000) {
      const dateObj = new Date(Math.round((serial - 25569) * 86400 * 1000));
      const y = dateObj.getUTCFullYear();
      const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
      const d = String(dateObj.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  const str = String(input).trim();
  if (!str) return null;

  // 3. ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // 4. Standard Slash or Dash Dates (DD/MM/YYYY or MM/DD/YYYY)
  const parts = str.match(/(^|\b)(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
  if (parts) {
    let p1 = parseInt(parts[2], 10);
    let p2 = parseInt(parts[3], 10);
    let yr = parseInt(parts[4], 10);
    if (yr < 100) yr += 2000;

    let day = p1;
    let month = p2;

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
      // Both <= 12, use user preference
      if (preferredFormat === "US") {
        month = p1;
        day = p2;
      } else {
        day = p1;
        month = p2;
      }
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${yr}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

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
    for (const [fileHeader, targetKey] of fieldMapping.entries()) {
      if (targetKey === "IGNORE" || targetKey === "IDENTITY_IGNORE") continue;
      const targetDef = DEFAULT_TARGET_FIELDS.find((f) => f.key === targetKey);
      const targetType = targetDef ? targetDef.type : "Text";
      const rawVal = row[fileHeader];

      if (targetType === "Date") {
        updates[targetKey] = parseDateValue(rawVal, dateFormatPreference);
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
    const errors: string[] = [];
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
    };

    reviews.push(item);
  });

  return reviews;
}
