import React, { useState, useEffect, useMemo } from "react";
import {
  Columns,
  Search,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  XCircle,
  Shield,
  Layers,
  HelpCircle,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { TargetFieldDefinition, IdentityConfig } from "./types";
import { AccountType } from "../types";
import { detectColumnFormat } from "./normalization";

export const ALIAS_MAP: Record<string, string[]> = {
  accountName: [
    "account",
    "accountname",
    "leaveaccount",
    "type",
    "leavetype",
    "absencetype",
    "absenceaccount",
    "holiday",
    "policy",
  ],
  date: [
    "date",
    "day",
    "absencedate",
    "leavedate",
    "entrydate",
    "effectivedate",
    "effective_date",
  ],
  start: [
    "start",
    "startdate",
    "from",
    "fromdate",
    "validfrom",
    "begin",
    "begindate",
  ],
  end: [
    "end",
    "enddate",
    "to",
    "todate",
    "validto",
    "until",
    "finish",
  ],
  cost: [
    "cost",
    "hours",
    "days",
    "duration",
    "amount",
    "value",
    "quantity",
    "time",
    "total",
    "units",
  ],
  billingMode: [
    "billingmode",
    "unit",
    "unittype",
    "rateunit",
    "billing_mode",
    "mode",
  ],
  requestStatus: [
    "status",
    "requeststatus",
    "state",
    "approvalstatus",
    "approval_status",
  ],
  comment: [
    "comment",
    "note",
    "notes",
    "reason",
    "description",
    "remarks",
    "message",
  ],
  salaryIdentifier: [
    "salaryid",
    "salaryidentifier",
    "payrollid",
    "employeeidentifier",
    "externalid",
    "payid",
  ],
  taxId: ["ssn", "taxid", "cpr", "nationalid", "socialsecurity"],
  email: ["email", "emailaddress", "e-mail"],
  phone: ["mobile", "cellphone", "cell", "phone", "telephone"],
  birthDate: ["dob", "dateofbirth", "birthday", "birthdate"],
  hireDate: ["startdate", "hiredfrom", "hiredate"],
  department: ["department", "dept", "division"],
};

export const DEFAULT_TARGET_FIELDS: TargetFieldDefinition[] = [
  {
    key: "accountName",
    label: "Leave Account Name",
    type: "Dropdown",
    required: true,
    category: "Absence Account",
    description: "The name of the leave account (e.g., Vacation, Flextime, Sick Leave).",
  },
  {
    key: "date",
    label: "Absence Date (Single)",
    type: "Date",
    category: "Timing",
    description: "The date of the absence (or single day adjustment).",
  },
  {
    key: "start",
    label: "Start Date (Range)",
    type: "Date",
    category: "Timing",
    description: "Start date if your file defines date ranges.",
  },
  {
    key: "end",
    label: "End Date (Range)",
    type: "Date",
    category: "Timing",
    description: "End date if your file defines date ranges.",
  },
  {
    key: "cost",
    label: "Cost / Hours / Days",
    type: "Numeric",
    required: true,
    category: "Values",
    description: "The adjustment cost or number of hours/days.",
  },
  {
    key: "billingMode",
    label: "Billing Mode / Unit",
    type: "Dropdown",
    dropdownOptions: ["Hours", "Days"],
    category: "Values",
    description: "The unit of the adjustment ('Hours' or 'Days').",
  },
  {
    key: "requestStatus",
    label: "Request Status",
    type: "Dropdown",
    dropdownOptions: ["Requested", "Approved", "Denied"],
    category: "Values",
    description: "Leave request status ('Requested', 'Approved', 'Denied').",
  },
  {
    key: "comment",
    label: "Note / Comment",
    type: "Text",
    category: "Details",
    description: "Optional notes, reason, or comments.",
  },
  {
    key: "salaryIdentifier",
    label: "Salary / Payroll ID",
    type: "Text",
    category: "Details",
    description: "External payroll code or salary identifier.",
  },
  {
    key: "taxId",
    label: "Tax ID / SSN",
    type: "Text",
    category: "Details",
    description: "Employee Tax ID or SSN.",
  },
];

interface FieldMapperProps {
  headers: string[];
  sampleRows: Record<string, any>[];
  identityConfig: IdentityConfig;
  accountTypes?: AccountType[];
  initialMapping?: Map<string, string>;
  dateFormatPreference?: "EU" | "US";
  onDateFormatChange?: (format: "EU" | "US") => void;
  onConfirm: (fieldMapping: Map<string, string>) => void;
  onBack: () => void;
}

export const FieldMapper: React.FC<FieldMapperProps> = ({
  headers,
  sampleRows,
  identityConfig,
  accountTypes = [],
  initialMapping,
  dateFormatPreference = "EU",
  onDateFormatChange,
  onConfirm,
  onBack,
}) => {
  // Identify which file columns were used for identity resolution
  const identityColumns = useMemo(() => {
    const set = new Set<string>();
    if (identityConfig.idColumn) set.add(identityConfig.idColumn);
    if (identityConfig.salaryIdColumn) set.add(identityConfig.salaryIdColumn);
    if (identityConfig.fullNameColumn) set.add(identityConfig.fullNameColumn);
    if (identityConfig.firstNameColumn) set.add(identityConfig.firstNameColumn);
    if (identityConfig.lastNameColumn) set.add(identityConfig.lastNameColumn);
    if (identityConfig.crossCheckNameColumn) set.add(identityConfig.crossCheckNameColumn);
    return set;
  }, [identityConfig]);

  // Target fields including live account types in dropdown options
  const targetFields: TargetFieldDefinition[] = useMemo(() => {
    return DEFAULT_TARGET_FIELDS.map((f) => {
      if (f.key === "accountName" && accountTypes.length > 0) {
        return {
          ...f,
          dropdownOptions: accountTypes.map((a) => a.name),
        };
      }
      return f;
    });
  }, [accountTypes]);

  // Smart Alias auto-matching algorithm
  const autoMatchHeader = (header: string): string => {
    if (identityColumns.has(header)) {
      return "IDENTITY_IGNORE";
    }

    const clean = header.toLowerCase().replace(/[\s_\-\.\:]/g, "");

    // 1. Direct exact key match
    for (const f of targetFields) {
      if (f.key.toLowerCase() === clean || f.label.toLowerCase().replace(/[\s_\-\.\:\(\)]/g, "") === clean) {
        return f.key;
      }
    }

    // 2. Canonical alias map lookup
    for (const [targetKey, aliases] of Object.entries(ALIAS_MAP)) {
      if (aliases.some((alias) => clean === alias || clean.includes(alias) || alias.includes(clean))) {
        // Validate target key exists in schema
        if (targetFields.some((f) => f.key === targetKey)) {
          return targetKey;
        }
      }
    }

    return "IGNORE";
  };

  // State: mapping of fileHeader -> targetKey ('IGNORE' | 'IDENTITY_IGNORE' | targetFieldKey)
  const [mapping, setMapping] = useState<Map<string, string>>(() => {
    const initial = new Map<string, string>();
    headers.forEach((h) => {
      if (initialMapping && initialMapping.has(h)) {
        initial.set(h, initialMapping.get(h)!);
      } else {
        initial.set(h, autoMatchHeader(h));
      }
    });
    return initial;
  });

  // Track which columns are manual vs auto
  const [manualColumns, setManualColumns] = useState<Set<string>>(new Set());

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [showUnmappedFirst, setShowUnmappedFirst] = useState(false);

  // Collision detection: check if multiple columns map to the same active target field
  const collisions = useMemo(() => {
    const counts = new Map<string, string[]>();
    for (const [header, targetKey] of mapping.entries()) {
      if (targetKey === "IGNORE" || targetKey === "IDENTITY_IGNORE") continue;
      const existing = counts.get(targetKey) || [];
      existing.push(header);
      counts.set(targetKey, existing);
    }

    const collisionMap = new Map<string, string[]>();
    for (const [targetKey, colList] of counts.entries()) {
      if (colList.length > 1) {
        collisionMap.set(targetKey, colList);
      }
    }
    return collisionMap;
  }, [mapping]);

  const hasCollision = collisions.size > 0;

  // Collision list for warning banner
  const collisionDetails = useMemo(() => {
    const list: { targetKey: string; targetLabel: string; columns: string[] }[] = [];
    for (const [targetKey, colList] of collisions.entries()) {
      const def = targetFields.find((f) => f.key === targetKey);
      list.push({
        targetKey,
        targetLabel: def ? def.label : targetKey,
        columns: colList,
      });
    }
    return list;
  }, [collisions, targetFields]);

  // Update a column's mapping
  const handleSelectField = (header: string, targetKey: string) => {
    setMapping((prev) => {
      const next = new Map(prev);
      next.set(header, targetKey);
      return next;
    });
    setManualColumns((prev) => {
      const next = new Set(prev);
      next.add(header);
      return next;
    });
  };

  // Shortcuts
  const handleIgnoreAllUnmapped = () => {
    setMapping((prev) => {
      const next = new Map(prev);
      headers.forEach((h) => {
        const val = next.get(h);
        if (!val || val === "UNMAPPED") {
          next.set(h, "IGNORE");
        }
      });
      return next;
    });
  };

  const handleAutoMatchAll = () => {
    setMapping((prev) => {
      const next = new Map();
      headers.forEach((h) => {
        next.set(h, autoMatchHeader(h));
      });
      return next;
    });
    setManualColumns(new Set());
  };

  // Group target fields by category
  const categories = useMemo(() => {
    const map = new Map<string, TargetFieldDefinition[]>();
    targetFields.forEach((field) => {
      const cat = field.category || "General";
      const list = map.get(cat) || [];
      list.push(field);
      map.set(cat, list);
    });
    return map;
  }, [targetFields]);

  // Display rows
  const displayHeaders = useMemo(() => {
    let list = [...headers];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((h) => h.toLowerCase().includes(q));
    }

    if (showUnmappedFirst) {
      list.sort((a, b) => {
        const aVal = mapping.get(a) || "IGNORE";
        const bVal = mapping.get(b) || "IGNORE";
        const aUnmapped = aVal === "IGNORE" && !identityColumns.has(a);
        const bUnmapped = bVal === "IGNORE" && !identityColumns.has(b);
        if (aUnmapped && !bUnmapped) return -1;
        if (!aUnmapped && bUnmapped) return 1;
        return 0;
      });
    }

    return list;
  }, [headers, searchQuery, showUnmappedFirst, mapping, identityColumns]);

  // Required fields check: accountName and cost are needed for leave adjustments
  const missingRequired = useMemo(() => {
    const mappedKeys = new Set(Array.from(mapping.values()));
    const missing: string[] = [];

    // cost is essential
    if (!mappedKeys.has("cost")) {
      missing.push("Cost / Hours / Days");
    }
    // Date or start date
    if (!mappedKeys.has("date") && !mappedKeys.has("start")) {
      missing.push("Absence Date or Start Date");
    }

    return missing;
  }, [mapping]);

  const handleProceed = () => {
    if (hasCollision) return;
    onConfirm(mapping);
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-8 max-w-6xl mx-auto">
      {/* Step Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full mb-2">
            <Columns className="w-3.5 h-3.5" />
            Step 4 of 4: Column Mapping
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            Map Spreadsheet Columns to System Fields
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Associate each column in your file with the corresponding target field. Columns used for employee identity are automatically preserved.
          </p>
        </div>

        {/* Shortcuts */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAutoMatchAll}
            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
            title="Auto match based on standard alias dictionary"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Auto-Match All
          </button>
          <button
            type="button"
            onClick={handleIgnoreAllUnmapped}
            className="px-3 py-2 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-lg text-xs font-semibold transition-colors"
          >
            Ignore Unmapped
          </button>
        </div>
      </div>

      {/* Date Format Setting & Pipeline Information Banner */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 text-blue-700 rounded-lg mt-0.5">
            <Calendar className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">
                Date Parsing Mode: {dateFormatPreference === "EU" ? "EU (DD/MM/YYYY)" : "US (MM/DD/YYYY)"}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-800 rounded-full border border-blue-300">
                Normalized to YYYY-MM-DD
              </span>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              {dateFormatPreference === "EU" ? (
                <>
                  Ambiguous dates (e.g. <code>01/07/2026</code>) are read as <strong>1st July 2026</strong> (Day first).
                </>
              ) : (
                <>
                  Ambiguous dates (e.g. <code>01/07/2026</code>) are read as <strong>January 7th, 2026</strong> (Month first).
                </>
              )}{" "}
              Native Excel date objects and unambiguous dates ({">"}12) are detected automatically.
            </p>
          </div>
        </div>

        {onDateFormatChange && (
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={() => onDateFormatChange(dateFormatPreference === "EU" ? "US" : "EU")}
              className="px-3 py-2 bg-white hover:bg-gray-50 border border-blue-300 rounded-lg text-xs font-semibold text-blue-800 shadow-sm transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
              Switch to {dateFormatPreference === "EU" ? "US (MM/DD/YYYY)" : "EU (DD/MM/YYYY)"}
            </button>
          </div>
        )}
      </div>

      {/* Collision Alert Banner */}
      {hasCollision && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg mb-6 animate-shake">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-red-900">
                Collision Detected: Duplicate Target Field Mapping
              </h4>
              <p className="text-xs text-red-700 mt-1">
                Multiple spreadsheet columns are mapped to the same target field. Please adjust so that each target field is mapped at most once:
              </p>
              <ul className="list-disc list-inside mt-2 text-xs text-red-800 space-y-1">
                {collisionDetails.map((c) => (
                  <li key={c.targetKey}>
                    Target field <strong>"{c.targetLabel}"</strong> is mapped by columns:{" "}
                    <span className="font-mono bg-red-100 px-1 py-0.5 rounded text-red-900">
                      {c.columns.join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Missing Required Fields Notice */}
      {missingRequired.length > 0 && !hasCollision && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-3.5 rounded-lg mb-6">
          <div className="flex items-center gap-2 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>
              <strong>Note:</strong> We recommend mapping the following recommended fields:{" "}
              <strong>{missingRequired.join(", ")}</strong>.
            </span>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search column headers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showUnmappedFirst}
            onChange={(e) => setShowUnmappedFirst(e.target.checked)}
            className="h-3.5 w-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          Show unmapped columns first
        </label>
      </div>

      {/* Table of Headers */}
      <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
        <div className="max-h-[460px] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-80">
                  File Column & Preview
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-36">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-80">
                  Target System Field
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {displayHeaders.map((header) => {
                const targetKey = mapping.get(header) || "IGNORE";
                const isIdentity = identityColumns.has(header) || targetKey === "IDENTITY_IGNORE";
                const isManual = manualColumns.has(header);
                const isIgnored = targetKey === "IGNORE";
                const isCollision = collisions.has(targetKey);

                // Sample values from first 3 rows
                const samples = sampleRows
                  .slice(0, 3)
                  .map((r) => r[header])
                  .filter((v) => v !== undefined && v !== null && String(v).trim() !== "");

                return (
                  <tr
                    key={header}
                    className={`hover:bg-gray-50 transition-colors ${
                      isCollision
                        ? "bg-red-50/50"
                        : isIdentity
                        ? "bg-purple-50/20"
                        : ""
                    }`}
                  >
                    {/* File Header & Sample Values */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                          {header}
                          {isCollision && (
                            <span className="text-xs text-red-600 font-bold bg-red-100 px-1.5 py-0.5 rounded">
                              Conflict
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span className="text-[11px] text-gray-400">Samples:</span>
                          {samples.length > 0 ? (
                            samples.map((val, i) => (
                              <span
                                key={i}
                                className="inline-block bg-gray-100 border border-gray-200 text-gray-700 text-[11px] px-1.5 py-0.5 rounded max-w-[140px] truncate"
                                title={String(val)}
                              >
                                {String(val)}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-gray-400 italic">No sample data</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isIdentity ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          <Shield className="w-3.5 h-3.5" />
                          Identity Column
                        </span>
                      ) : isCollision ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-red-100 text-red-800 border border-red-300">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Conflict
                        </span>
                      ) : isIgnored ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                          <XCircle className="w-3.5 h-3.5" />
                          Ignored
                        </span>
                      ) : isManual ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Manual
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                          <Sparkles className="w-3.5 h-3.5" />
                          Auto-Matched
                        </span>
                      )}
                    </td>

                    {/* Target Field Dropdown */}
                    <td className="px-4 py-3">
                      {isIdentity ? (
                        <div className="text-xs text-purple-700 font-medium py-1">
                          Used for employee resolution (Protected from overwrite)
                        </div>
                      ) : (
                        <select
                          value={targetKey}
                          onChange={(e) => handleSelectField(header, e.target.value)}
                          className={`w-full px-3 py-1.5 text-xs rounded-lg border font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs ${
                            isCollision
                              ? "border-red-400 bg-red-50 text-red-900 font-bold"
                              : !isIgnored
                              ? "border-blue-400 bg-blue-50/20 text-gray-900 font-semibold"
                              : "border-gray-300 bg-white text-gray-700"
                          }`}
                        >
                          <option value="IGNORE">-- [Ignore Column / Do Not Import] --</option>
                          {Array.from(categories.entries()).map(([cat, fields]) => (
                            <optgroup key={cat} label={`── ${cat} ──`}>
                              {fields.map((field) => (
                                <option key={field.key} value={field.key}>
                                  {field.label} ({field.type})
                                  {field.required ? " *" : ""}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}

              {displayHeaders.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-8 text-gray-500 text-sm">
                    No headers match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Employee Mapping
        </button>

        <button
          type="button"
          onClick={handleProceed}
          disabled={hasCollision}
          className={`px-6 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition-colors flex items-center gap-2 ${
            hasCollision
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          <span>Continue to Normalization & Review</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
