import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  FileCheck,
  Search,
} from "lucide-react";
import { AdjustmentReview } from "../types";

interface PreflightValidationScreenProps {
  reviews: AdjustmentReview[];
  onProceedToReview: () => void;
  onBackToFields: () => void;
  onBackToEmployees: () => void;
}

export const PreflightValidationScreen: React.FC<PreflightValidationScreenProps> = ({
  reviews,
  onProceedToReview,
  onBackToFields,
  onBackToEmployees,
}) => {
  const [filterErrorsOnly, setFilterErrorsOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const errorRows = reviews.filter((r) => r.isValidationError || r.error);
  const validRows = reviews.filter((r) => !r.isValidationError && !r.error);

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
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-800 text-xs font-semibold rounded-full mb-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          Pre-Flight Validation Check
        </div>
        <h2 className="text-2xl font-bold text-gray-900">
          Review Data Normalization & Validation Issues
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          We analyzed your mapped records. You can inspect validation issues below and proceed to the interactive review table to make live adjustments.
        </p>
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
              Needs Attention
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
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterErrorsOnly ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-600 hover:text-gray-900"
            }`}
          >
            Show Errors Only ({errorRows.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterErrorsOnly(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
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
                  Validation Status & Details
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {displayList.map((row, idx) => {
                const hasError = !!row.error;
                return (
                  <tr
                    key={row.id || idx}
                    className={`hover:bg-gray-50 transition-colors ${
                      hasError ? "bg-red-50/30" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-semibold text-gray-900 text-xs">
                      {row.employeeName}
                      {row.salaryIdentifier && (
                        <span className="block text-[11px] text-gray-400 font-mono">
                          Sal: {row.salaryIdentifier}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-800">
                      {row.accountName || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-600">
                      {row.date || row.start || <span className="text-red-600 italic">Missing</span>}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-800">
                      {row.cost ?? 0} {row.billingMode}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {hasError ? (
                        <div className="text-red-700 font-medium flex items-center gap-1.5">
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          <span>{row.error}</span>
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
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToFields}
            className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Column Mapping
          </button>
          <button
            type="button"
            onClick={onBackToEmployees}
            className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-xs font-semibold transition-colors"
          >
            Back to Employees
          </button>
        </div>

        <button
          type="button"
          onClick={onProceedToReview}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors flex items-center gap-2"
        >
          <span>Open Full Interactive Review Table</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
