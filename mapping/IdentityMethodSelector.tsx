import React, { useState, useMemo } from "react";
import { UserCheck, Hash, Users, ArrowRight, ShieldCheck, AlertCircle, Info } from "lucide-react";
import { IdentityConfig, IdentityMethod, DiscrepancyItem } from "./types";
import { Employee } from "../types";
import { calculateNameSimilarity } from "./similarity";
import { DiscrepancyModal } from "./DiscrepancyModal";

interface IdentityMethodSelectorProps {
  headers: string[];
  sampleRows: Record<string, any>[];
  allEmployees: Employee[];
  initialConfig?: IdentityConfig;
  onConfirm: (config: IdentityConfig) => void;
  onBack: () => void;
}

export const IdentityMethodSelector: React.FC<IdentityMethodSelectorProps> = ({
  headers,
  sampleRows,
  allEmployees,
  initialConfig,
  onConfirm,
  onBack,
}) => {
  // Heuristic detections
  const detectedIdCol = useMemo(() => {
    return headers.find((h) => {
      const l = h.toLowerCase().replace(/[\s_-]/g, "");
      return l === "employeeid" || l === "empid" || l === "apiid" || l === "id" || l === "systemid";
    }) || headers[0] || "";
  }, [headers]);

  const detectedSalaryCol = useMemo(() => {
    return headers.find((h) => {
      const l = h.toLowerCase().replace(/[\s_-]/g, "");
      return l.includes("salaryid") || l.includes("payrollid") || l.includes("salaryidentifier") || l.includes("externalid") || l === "salary";
    }) || "";
  }, [headers]);

  const detectedNameCol = useMemo(() => {
    return headers.find((h) => {
      const l = h.toLowerCase().replace(/[\s_-]/g, "");
      return l === "employee" || l === "employeename" || l === "fullname" || l === "name";
    }) || "";
  }, [headers]);

  const detectedFirstNameCol = useMemo(() => {
    return headers.find((h) => {
      const l = h.toLowerCase().replace(/[\s_-]/g, "");
      return l === "firstname" || l === "first" || l === "givenname";
    }) || "";
  }, [headers]);

  const detectedLastNameCol = useMemo(() => {
    return headers.find((h) => {
      const l = h.toLowerCase().replace(/[\s_-]/g, "");
      return l === "lastname" || l === "last" || l === "surname";
    }) || "";
  }, [headers]);

  // Initial method selection
  const defaultMethod: IdentityMethod = useMemo(() => {
    if (initialConfig?.method) return initialConfig.method;
    if (detectedSalaryCol && detectedNameCol) return "salary_and_name";
    if (detectedIdCol && (detectedIdCol.toLowerCase().includes("id") || detectedIdCol.toLowerCase().includes("api"))) {
      return "system_id";
    }
    return "salary_and_name";
  }, [initialConfig, detectedSalaryCol, detectedNameCol, detectedIdCol]);

  const [method, setMethod] = useState<IdentityMethod>(defaultMethod);
  const [idColumn, setIdColumn] = useState<string>(initialConfig?.idColumn || detectedIdCol);
  const [salaryIdColumn, setSalaryIdColumn] = useState<string>(
    initialConfig?.salaryIdColumn || detectedSalaryCol || (headers[0] || "")
  );

  const [nameFormat, setNameFormat] = useState<"single" | "split">(
    initialConfig?.nameFormat || (detectedFirstNameCol && detectedLastNameCol ? "split" : "single")
  );
  const [fullNameColumn, setFullNameColumn] = useState<string>(
    initialConfig?.fullNameColumn || detectedNameCol || (headers[1] || headers[0] || "")
  );
  const [firstNameColumn, setFirstNameColumn] = useState<string>(
    initialConfig?.firstNameColumn || detectedFirstNameCol || (headers[0] || "")
  );
  const [lastNameColumn, setLastNameColumn] = useState<string>(
    initialConfig?.lastNameColumn || detectedLastNameCol || (headers[1] || headers[0] || "")
  );

  const [validationError, setValidationError] = useState<string | null>(null);

  // Optional Cross-Check Safeguard for API ID matching
  const [enableCrossCheck, setEnableCrossCheck] = useState<boolean>(
    initialConfig?.enableCrossCheck ?? (detectedNameCol ? true : false)
  );
  const [crossCheckNameColumn, setCrossCheckNameColumn] = useState<string>(
    initialConfig?.crossCheckNameColumn || detectedNameCol || ""
  );

  const [discrepancies, setDiscrepancies] = useState<DiscrepancyItem[] | null>(null);
  const [showDiscrepancyModal, setShowDiscrepancyModal] = useState<boolean>(false);

  // Cross-check discrepancy detection algorithm (API ID vs Name in file)
  const performCrossCheck = (): DiscrepancyItem[] => {
    if (!enableCrossCheck || !crossCheckNameColumn || method !== "system_id") return [];

    const foundDiscrepancies: DiscrepancyItem[] = [];

    sampleRows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const idValStr = String(row[idColumn] || "").trim();
      const numId = parseInt(idValStr, 10);
      let matchedEmp: Employee | undefined = undefined;

      if (!isNaN(numId)) {
        matchedEmp = allEmployees.find((e) => e.id === numId);
      }

      const uploadedName = String(row[crossCheckNameColumn] || "").trim();

      if (matchedEmp && uploadedName) {
        const expectedName = `${matchedEmp.firstName} ${matchedEmp.lastName}`.trim();
        const sim = calculateNameSimilarity(uploadedName, expectedName);
        if (sim < 0.60) {
          foundDiscrepancies.push({
            rowIndex: idx,
            rowNumber: rowNum,
            idValue: idValStr,
            expectedName,
            uploadedName,
          });
        }
      }
    });

    return foundDiscrepancies;
  };

  const handleProceed = () => {
    setValidationError(null);

    if (method === "system_id") {
      if (!idColumn) {
        setValidationError("Please select the column containing the Employee API ID.");
        return;
      }
    } else {
      // salary_and_name: BOTH ARE REQUIRED
      if (!salaryIdColumn) {
        setValidationError("Salary Identifier column is required.");
        return;
      }
      if (nameFormat === "single" && !fullNameColumn) {
        setValidationError("Employee Name column is required.");
        return;
      }
      if (nameFormat === "split" && (!firstNameColumn || !lastNameColumn)) {
        setValidationError("Both First Name and Last Name columns are required.");
        return;
      }
      if (nameFormat === "single" && salaryIdColumn === fullNameColumn) {
        setValidationError("Salary Identifier and Employee Name cannot be mapped to the exact same column.");
        return;
      }
    }

    const config: IdentityConfig = {
      method,
      idColumn: method === "system_id" ? idColumn : undefined,
      salaryIdColumn: method === "salary_and_name" ? salaryIdColumn : undefined,
      nameFormat: method === "salary_and_name" ? nameFormat : undefined,
      fullNameColumn: method === "salary_and_name" && nameFormat === "single" ? fullNameColumn : undefined,
      firstNameColumn: method === "salary_and_name" && nameFormat === "split" ? firstNameColumn : undefined,
      lastNameColumn: method === "salary_and_name" && nameFormat === "split" ? lastNameColumn : undefined,
      crossCheckNameColumn: method === "system_id" && enableCrossCheck ? crossCheckNameColumn : undefined,
      enableCrossCheck: method === "system_id" && enableCrossCheck,
    };

    if (method === "system_id" && enableCrossCheck && crossCheckNameColumn) {
      const items = performCrossCheck();
      if (items.length > 0) {
        setDiscrepancies(items);
        setShowDiscrepancyModal(true);
        return;
      }
    }

    onConfirm(config);
  };

  const handleIgnoreDiscrepancies = () => {
    setShowDiscrepancyModal(false);
    const config: IdentityConfig = {
      method: "system_id",
      idColumn,
      crossCheckNameColumn: undefined,
      enableCrossCheck: false,
    };
    onConfirm(config);
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-8 max-w-4xl mx-auto">
      {/* Title & Description */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full mb-3">
          <UserCheck className="w-3.5 h-3.5" />
          Step 2 of 4: Identity Resolution Method
        </div>
        <h2 className="text-2xl font-bold text-gray-900">
          How are employees identified in your file?
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Select whether records are identified by Employee API ID or by both Salary Identifier and Employee Name.
        </p>
      </div>

      {/* Validation Error Banner */}
      {validationError && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-3.5 rounded-lg flex items-center gap-2.5 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* 2 Primary Method Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
        {/* Method 1: Employee API ID */}
        <button
          type="button"
          onClick={() => {
            setMethod("system_id");
            setValidationError(null);
          }}
          className={`flex flex-col text-left p-6 rounded-xl border-2 transition-all cursor-pointer relative ${
            method === "system_id"
              ? "border-blue-600 bg-blue-50/50 shadow-xs"
              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-3">
            <div className={`p-2.5 rounded-lg ${method === "system_id" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>
              <Hash className="w-5 h-5" />
            </div>
            {method === "system_id" && (
              <span className="px-2 py-0.5 bg-blue-600 text-white text-[11px] font-bold rounded-full">
                Active
              </span>
            )}
          </div>
          <span className="font-bold text-gray-900 text-base">Employee API ID</span>
          <span className="text-xs text-gray-600 mt-1.5 leading-relaxed">
            Link records using Planday Employee API ID. The employee name and salary identifier will be fetched directly from Planday and assumed as exact matches in the review table.
          </span>
        </button>

        {/* Method 2: Salary Identifier & Employee Name (Both Required) */}
        <button
          type="button"
          onClick={() => {
            setMethod("salary_and_name");
            setValidationError(null);
          }}
          className={`flex flex-col text-left p-6 rounded-xl border-2 transition-all cursor-pointer relative ${
            method === "salary_and_name"
              ? "border-blue-600 bg-blue-50/50 shadow-xs"
              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-3">
            <div className={`p-2.5 rounded-lg ${method === "salary_and_name" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>
              <Users className="w-5 h-5" />
            </div>
            {method === "salary_and_name" && (
              <span className="px-2 py-0.5 bg-blue-600 text-white text-[11px] font-bold rounded-full">
                Active
              </span>
            )}
          </div>
          <span className="font-bold text-gray-900 text-base">Salary Identifier & Employee Name</span>
          <span className="text-xs text-gray-600 mt-1.5 leading-relaxed">
            <strong className="text-blue-700">Both are required.</strong> Select the columns for Salary Identifier (Payroll ID) and Employee Name to resolve matching employees.
          </span>
        </button>
      </div>

      {/* Configuration Form Based on Selection */}
      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 mb-8 space-y-6">
        {method === "system_id" ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                Select Column for Employee API ID <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-3">
                The spreadsheet column containing numeric Planday employee IDs (e.g., 10423).
              </p>
              <select
                value={idColumn}
                onChange={(e) => setIdColumn(e.target.value)}
                className="w-full md:w-96 px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              >
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h} {sampleRows[0]?.[h] ? `(e.g., "${sampleRows[0][h]}")` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Note about auto-fetching name and salary ID */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2.5 text-xs text-blue-900">
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Exact Match Auto-Fill:</strong> The review table will automatically retrieve each employee's name and salary identifier from Planday for this ID and treat them as exact matches.
              </div>
            </div>

            {/* Optional Safeguard: Cross check with name column in file if present */}
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-start gap-3">
                <input
                  id="crossCheckCheckbox"
                  type="checkbox"
                  checked={enableCrossCheck}
                  onChange={(e) => setEnableCrossCheck(e.target.checked)}
                  className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <label htmlFor="crossCheckCheckbox" className="text-sm font-semibold text-gray-900 cursor-pointer flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    Enable Name & ID Discrepancy Cross-Check (Recommended Safeguard)
                  </label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Verifies whether the name written in the row matches the database employee registered to that ID.
                  </p>

                  {enableCrossCheck && (
                    <div className="mt-3">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Select Name Column in File for Cross-Checking:
                      </label>
                      <select
                        value={crossCheckNameColumn}
                        onChange={(e) => setCrossCheckNameColumn(e.target.value)}
                        className="w-full md:w-80 px-3 py-1.5 bg-white border border-gray-300 rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Choose Name Column --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h} {sampleRows[0]?.[h] ? `(e.g., "${sampleRows[0][h]}")` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Method 2: Salary Identifier & Employee Name (Both Required) */
          <div className="space-y-6">
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span>
                Both <strong>Salary Identifier</strong> and <strong>Employee Name</strong> are required to ensure reliable employee identification.
              </span>
            </div>

            {/* 1. Salary Identifier Column */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                1. Select Column for Salary Identifier <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Spreadsheet column containing salary / payroll IDs (e.g. "EMP-104", "SAL20").
              </p>
              <select
                value={salaryIdColumn}
                onChange={(e) => setSalaryIdColumn(e.target.value)}
                className="w-full md:w-96 px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              >
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h} {sampleRows[0]?.[h] ? `(e.g., "${sampleRows[0][h]}")` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Employee Name Column */}
            <div className="pt-4 border-t border-gray-200">
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                2. Select Column for Employee Name <span className="text-red-500">*</span>
              </label>

              {/* Format selection */}
              <div className="flex items-center gap-6 mb-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="nameFormatSub"
                    checked={nameFormat === "single"}
                    onChange={() => setNameFormat("single")}
                    className="text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                  />
                  Single Full Name Column (e.g. "Jane Doe")
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="nameFormatSub"
                    checked={nameFormat === "split"}
                    onChange={() => setNameFormat("split")}
                    className="text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                  />
                  Split Columns (First Name + Last Name)
                </label>
              </div>

              {nameFormat === "single" ? (
                <div>
                  <select
                    value={fullNameColumn}
                    onChange={(e) => setFullNameColumn(e.target.value)}
                    className="w-full md:w-96 px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                  >
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h} {sampleRows[0]?.[h] ? `(e.g., "${sampleRows[0][h]}")` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      First Name Column
                    </label>
                    <select
                      value={firstNameColumn}
                      onChange={(e) => setFirstNameColumn(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                    >
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h} {sampleRows[0]?.[h] ? `(e.g., "${sampleRows[0][h]}")` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Last Name Column
                    </label>
                    <select
                      value={lastNameColumn}
                      onChange={(e) => setLastNameColumn(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                    >
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h} {sampleRows[0]?.[h] ? `(e.g., "${sampleRows[0][h]}")` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-semibold transition-colors"
        >
          &larr; Back to Upload
        </button>

        <button
          type="button"
          onClick={handleProceed}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors flex items-center gap-2"
        >
          <span>Continue to Employee Mapping</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Discrepancy Modal */}
      {showDiscrepancyModal && discrepancies && (
        <DiscrepancyModal
          discrepancies={discrepancies}
          onIgnoreAndProceed={handleIgnoreDiscrepancies}
          onCancel={() => setShowDiscrepancyModal(false)}
        />
      )}
    </div>
  );
};
