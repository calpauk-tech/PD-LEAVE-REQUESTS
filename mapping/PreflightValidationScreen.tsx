import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  FileCheck,
  Search,
  Download,
  SkipForward,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { AdjustmentReview } from "../types";
import * as XLSX from "xlsx-js-style";

interface PreflightValidationScreenProps {
  reviews: AdjustmentReview[];
  dateFormatPreference?: "EU" | "US";
  onToggleDateFormat?: () => void;
  onProceedToReview: () => void;
  onBackToFields: () => void;
  onBackToEmployees: () => void;
  onSkipErrorsAndProceed?: (validReviews: AdjustmentReview[], skippedReviews: AdjustmentReview[]) => void;
}

const formatDateReadable = (isoString?: string | null, format: "EU" | "US" = "EU") => {
  if (!isoString || !/^\d{4}-\d{2}-\d{2}$/.test(isoString)) return isoString || "";
  const [y, m, d] = isoString.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthName = months[m - 1] || "";
  if (format === "US") {
    return `${m.toString().padStart(2, "0")}/${d.toString().padStart(2, "0")}/${y} (${monthName} ${d}, ${y})`;
  }
  return `${d.toString().padStart(2, "0")}/${m.toString().padStart(2, "0")}/${y} (${d} ${monthName} ${y})`;
};

export const PreflightValidationScreen: React.FC<PreflightValidationScreenProps> = ({
  reviews,
  dateFormatPreference = "EU",
  onToggleDateFormat,
  onProceedToReview,
  onBackToFields,
  onBackToEmployees,
  onSkipErrorsAndProceed,
}) => {
  const [filterErrorsOnly, setFilterErrorsOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const errorRows = reviews.filter((r) => r.isValidationError || r.error);
  const validRows = reviews.filter((r) => !r.isValidationError && !r.error);

  const handleExportValidationReport = () => {
    const headers = [
      "Employee",
      "Salary ID",
      "Account",
      "Date",
      "Cost",
      "Unit",
      "Status",
      "Validation Issue / Reason",
    ];

    const data = (errorRows.length > 0 ? errorRows : reviews).map((r) => ({
      Employee: r.employeeName,
      "Salary ID": r.salaryIdentifier || "",
      Account: r.accountName,
      Date: r.date || r.start || "Missing",
      Cost: r.cost !== undefined ? r.cost : "",
      Unit: r.billingMode || r.unit || "",
      Status: r.isValidationError || r.error ? "Validation Issue" : "Valid",
      "Validation Issue / Reason": r.error || "Ready",
    }));

    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Validation Issues");
    XLSX.writeFile(wb, `Planday_Validation_Issues_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const displayList = (filterErrorsOnly ? errorRows : reviews).filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.employeeName.toLowerCase().includes(q) ||
      r.accountName.toLowerCase().includes(q) ||
      (r.error && r.error.toLowerCase().includes(q)) ||
      (r.date && r.date.toLowerCase().includes(q))
    );
  });

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-800 text-xs font-semibold rounded-full mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Pre-Flight Validation Check
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            Review Data Normalization & Validation Issues
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            We analyzed your mapped records. You can inspect validation issues below, export a diagnostic report, or proceed to the interactive review table.
          </p>
        </div>

        {errorRows.length > 0 && (
          <button
            type="button"
            onClick={handleExportValidationReport}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg border border-gray-300 transition-colors self-start whitespace-nowrap cursor-pointer shadow-sm"
            title="Export validation issues to Excel"
          >
            <Download className="w-3.5 h-3.5 text-gray-500" />
            Export Issues Report (.xlsx)
          </button>
        )}
      </div>

      {/* Date Format Setting & Switcher */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
            <Calendar className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-900">
              Active Date Format: {dateFormatPreference === "EU" ? "EU (DD/MM/YYYY — Day First)" : "US (MM/DD/YYYY — Month First)"}
            </span>
            <span className="ml-2 text-[11px] text-gray-600">
              Payload standard: <code className="bg-white px-1 py-0.5 rounded border border-gray-200 text-blue-700 font-mono">YYYY-MM-DD</code>
            </span>
          </div>
        </div>

        {onToggleDateFormat && (
          <button
            type="button"
            onClick={onToggleDateFormat}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-blue-700 text-xs font-semibold rounded-lg border border-blue-300 shadow-sm transition-colors cursor-pointer"
            title="Switch between EU and US date parsing and re-normalize immediately"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
            Switch to {dateFormatPreference === "EU" ? "US (MM/DD/YYYY)" : "EU (DD/MM/YYYY)"}
          </button>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Total Mapped Rows
            </span>
            <div className="text-2xl font-bold text-gray-900 mt-1">{reviews.length}</div>
          </div>
          <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
            <FileCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-green-50/50 rounded-xl p-4 border border-green-200 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-green-700 uppercase tracking-wider">
              Valid Ready to Post
            </span>
            <div className="text-2xl font-bold text-green-700 mt-1">{validRows.length}</div>
          </div>
          <div className="p-3 bg-green-100 text-green-700 rounded-xl">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-red-50/50 rounded-xl p-4 border border-red-200 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-red-700 uppercase tracking-wider">
              Needs Attention / Errors
            </span>
            <div className="text-2xl font-bold text-red-700 mt-1">{errorRows.length}</div>
          </div>
          <div className="p-3 bg-red-100 text-red-700 rounded-xl">
            <XCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search records or error messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterErrorsOnly(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              filterErrorsOnly ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-600 hover:text-gray-900"
            }`}
          >
            Show Errors Only ({errorRows.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterErrorsOnly(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              !filterErrorsOnly ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600 hover:text-gray-900"
            }`}
          >
            Show All ({reviews.length})
          </button>
        </div>
      </div>

      {/* Table of Records */}
      <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
        <div className="max-h-[380px] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">
                  Employee
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">
                  Account
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">
                  Date
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">
                  Cost / Unit
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">
                  Validation Status & Diagnostics
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {displayList.map((row) => {
                const hasError = row.isValidationError || row.error;
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      hasError ? "bg-red-50/40" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 text-xs">
                        {row.employeeName}
                      </div>
                      {row.salaryIdentifier && (
                        <div className="text-[11px] font-mono text-gray-400">
                          SID: {row.salaryIdentifier}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {row.accountName}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {row.date || row.start ? (
                        <div className="flex flex-col">
                          <span className="font-mono font-semibold text-gray-900">
                            {row.date || row.start}
                          </span>
                          <span className="text-[11px] text-blue-600 font-sans mt-0.5">
                            {formatDateReadable(row.date || row.start, dateFormatPreference)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-red-500 font-medium">Missing</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-700">
                      {row.cost} {row.billingMode}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {hasError ? (
                        <div className="flex flex-col gap-1">
                          <div className="text-red-700 font-medium flex items-start gap-1.5">
                            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <span>{row.error}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-green-700 font-medium flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                          <span>Ready</span>
                        </div>
                      )}
                      {row.billingModeError && (
                        <div className="text-blue-600 text-[11px] mt-0.5">
                          {row.billingModeError}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {displayList.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500 text-xs">
                    {filterErrorsOnly
                      ? "Great news! No validation errors found."
                      : "No matching records found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-gray-200">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={onBackToFields}
            className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Column Mapping
          </button>
          <button
            type="button"
            onClick={onBackToEmployees}
            className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Back to Employees
          </button>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          {errorRows.length > 0 && onSkipErrorsAndProceed && (
            <button
              type="button"
              onClick={() => onSkipErrorsAndProceed(validRows, errorRows)}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Skip rows with validation issues and proceed with valid records only. All skipped rows will be fully logged in the Error Log Report."
            >
              <SkipForward className="w-3.5 h-3.5" />
              <span>Skip Invalid ({errorRows.length}) & Proceed ({validRows.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={onProceedToReview}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
          >
            <span>Open Full Interactive Review Table</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
