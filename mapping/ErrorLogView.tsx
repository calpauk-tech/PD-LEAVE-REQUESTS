import React, { useState, useMemo } from "react";
import {
  AlertTriangle,
  Download,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Info,
  X,
  FileSpreadsheet,
} from "lucide-react";
import { ErrorLogItem, ErrorStage, exportErrorLogReportToExcel } from "./errorLogService";

interface ErrorLogViewProps {
  errorLogItems: ErrorLogItem[];
  totalFileRows?: number;
  dateFormatPreference?: "EU" | "US";
  onRetryFailed?: () => void;
  hasApiFailures?: boolean;
}

export const ErrorLogView: React.FC<ErrorLogViewProps> = ({
  errorLogItems,
  totalFileRows,
  dateFormatPreference = "EU",
  onRetryFailed,
  hasApiFailures,
}) => {
  const [selectedStage, setSelectedStage] = useState<"all" | ErrorStage>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<ErrorLogItem | null>(null);

  const stageCounts = useMemo(() => {
    let mapping = 0;
    let validation = 0;
    let update = 0;

    errorLogItems.forEach((item) => {
      if (item.stage === "mapping") mapping++;
      else if (item.stage === "validation") validation++;
      else if (item.stage === "update") update++;
    });

    return { mapping, validation, update, total: errorLogItems.length };
  }, [errorLogItems]);

  const filteredItems = useMemo(() => {
    return errorLogItems.filter((item) => {
      if (selectedStage !== "all" && item.stage !== selectedStage) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const rowMatch = String(item.sourceRowNumber).includes(q);
        const nameMatch = item.employeeName.toLowerCase().includes(q);
        const salMatch = item.salaryIdentifier?.toLowerCase().includes(q) || false;
        const pNameMatch = item.portalEmployeeName?.toLowerCase().includes(q) || false;
        const accMatch = item.accountName.toLowerCase().includes(q);
        const catMatch = item.errorCategory.toLowerCase().includes(q);
        const msgMatch = item.errorMessage.toLowerCase().includes(q);
        const expMatch = item.explanation.toLowerCase().includes(q);

        return (
          rowMatch ||
          nameMatch ||
          salMatch ||
          pNameMatch ||
          accMatch ||
          catMatch ||
          msgMatch ||
          expMatch
        );
      }

      return true;
    });
  }, [errorLogItems, selectedStage, searchQuery]);

  const handleExport = () => {
    exportErrorLogReportToExcel(errorLogItems, totalFileRows, dateFormatPreference);
  };

  const getStageBadge = (stage: ErrorStage) => {
    switch (stage) {
      case "mapping":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
            1. Employee Mapping
          </span>
        );
      case "validation":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            2. Validation Check
          </span>
        );
      case "update":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
            3. API Update Failure
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Top Banner & Quick Diagnostics */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl flex-shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-base font-bold text-amber-900">
              {stageCounts.total} Unsent Employee Request{stageCounts.total !== 1 ? "s" : ""} Documented
            </h4>
            <p className="text-xs text-amber-800 mt-1 max-w-2xl leading-relaxed">
              Every request that was not uploaded has been compiled below with exact source row numbers, root cause explanations, and recommended resolutions across each workflow stage.
            </p>
          </div>
        </div>

        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors cursor-pointer self-start md:self-center whitespace-nowrap"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Export Error Log Report (.xlsx)</span>
        </button>
      </div>

      {/* Stage KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => setSelectedStage("mapping")}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            selectedStage === "mapping"
              ? "bg-purple-50 border-purple-400 shadow-sm ring-1 ring-purple-400"
              : "bg-white border-gray-200 hover:border-purple-200 hover:bg-purple-50/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider">
              1. Unmapped in Mapping
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
              Stage 1
            </span>
          </div>
          <div className="text-2xl font-bold text-purple-900 mt-2">{stageCounts.mapping}</div>
          <p className="text-[11px] text-purple-700/80 mt-1">
            Employees not mapped to Planday profiles or skipped
          </p>
        </div>

        <div
          onClick={() => setSelectedStage("validation")}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            selectedStage === "validation"
              ? "bg-amber-50 border-amber-400 shadow-sm ring-1 ring-amber-400"
              : "bg-white border-gray-200 hover:border-amber-200 hover:bg-amber-50/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
              2. Validation Issues
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
              Stage 2
            </span>
          </div>
          <div className="text-2xl font-bold text-amber-900 mt-2">{stageCounts.validation}</div>
          <p className="text-[11px] text-amber-700/80 mt-1">
            Missing dates, account not found, or cost exceeded limits
          </p>
        </div>

        <div
          onClick={() => setSelectedStage("update")}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            selectedStage === "update"
              ? "bg-red-50 border-red-400 shadow-sm ring-1 ring-red-400"
              : "bg-white border-gray-200 hover:border-red-200 hover:bg-red-50/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-700 uppercase tracking-wider">
              3. API Update Failures
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
              Stage 3
            </span>
          </div>
          <div className="text-2xl font-bold text-red-900 mt-2">{stageCounts.update}</div>
          <p className="text-[11px] text-red-700/80 mt-1">
            Planday API rejection, overlaps, or network errors
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by row #, employee, error..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
          <span className="text-xs text-gray-500 font-medium mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          <button
            type="button"
            onClick={() => setSelectedStage("all")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              selectedStage === "all"
                ? "bg-gray-800 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All Stages ({stageCounts.total})
          </button>
          <button
            type="button"
            onClick={() => setSelectedStage("mapping")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              selectedStage === "mapping"
                ? "bg-purple-600 text-white"
                : "bg-purple-50 text-purple-700 hover:bg-purple-100"
            }`}
          >
            Mapping ({stageCounts.mapping})
          </button>
          <button
            type="button"
            onClick={() => setSelectedStage("validation")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              selectedStage === "validation"
                ? "bg-amber-600 text-white"
                : "bg-amber-50 text-amber-800 hover:bg-amber-100"
            }`}
          >
            Validation ({stageCounts.validation})
          </button>
          <button
            type="button"
            onClick={() => setSelectedStage("update")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              selectedStage === "update"
                ? "bg-red-600 text-white"
                : "bg-red-50 text-red-800 hover:bg-red-100"
            }`}
          >
            API Failures ({stageCounts.update})
          </button>
        </div>
      </div>

      {/* Error Log Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs bg-white">
        <div className="max-h-[520px] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10 text-xs font-semibold text-gray-600 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left w-24">Source Row</th>
                <th className="px-4 py-3 text-left w-40">Workflow Stage</th>
                <th className="px-4 py-3 text-left">Employee & Account</th>
                <th className="px-4 py-3 text-left w-28">Date & Cost</th>
                <th className="px-4 py-3 text-left">Issue Category & Explanation</th>
                <th className="px-4 py-3 text-right w-24">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItems.map((item) => {
                return (
                  <tr
                    key={item.id}
                    className="hover:bg-gray-50 transition-colors group cursor-pointer"
                    onClick={() => setSelectedItem(item)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                        {item.sourceRowNumber > 0 ? `Row ${item.sourceRowNumber}` : "N/A"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getStageBadge(item.stage)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 text-xs">
                        {item.employeeName}
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
                        <span>{item.accountName}</span>
                        {item.salaryIdentifier && (
                          <span className="font-mono text-[10px] text-gray-400">
                            (SID: {item.salaryIdentifier})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">
                      <div>{item.date || <span className="text-red-500 font-semibold">Missing Date</span>}</div>
                      <div className="text-[11px] font-mono text-gray-500">
                        {item.cost !== undefined ? `${item.cost} ${item.billingMode || ""}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-semibold text-red-700 flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        <span>{item.errorCategory}</span>
                      </div>
                      <p className="text-[11px] text-gray-600 mt-0.5 line-clamp-2" title={item.explanation}>
                        {item.explanation}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItem(item);
                        }}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition-colors"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500 text-xs">
                    {searchQuery
                      ? "No unsent requests match your search criteria."
                      : "No unsent requests found for this filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Item Detail Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-gray-200 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold bg-gray-100 text-gray-700 px-2.5 py-1 rounded">
                  {selectedItem.sourceRowNumber > 0 ? `Excel Row ${selectedItem.sourceRowNumber}` : "Row"}
                </span>
                {getStageBadge(selectedItem.stage)}
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">
                Reason Request Was Not Sent
              </span>
              <h3 className="text-lg font-bold text-gray-900 mt-0.5">
                {selectedItem.errorCategory}
              </h3>
            </div>

            {/* Explanation card */}
            <div className="bg-red-50/60 border border-red-200 rounded-xl p-4">
              <div className="text-xs font-bold text-red-800 mb-1 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                Root Cause Explanation:
              </div>
              <p className="text-xs text-red-900 leading-relaxed">
                {selectedItem.explanation}
              </p>
              {selectedItem.errorMessage && selectedItem.errorMessage !== selectedItem.errorCategory && (
                <div className="mt-2.5 pt-2 border-t border-red-200/60 font-mono text-[11px] text-red-700 break-words">
                  <strong>Technical message:</strong> {selectedItem.errorMessage}
                </div>
              )}
            </div>

            {/* Recommended Action */}
            <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4">
              <div className="text-xs font-bold text-blue-800 mb-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                Recommended Resolution:
              </div>
              <p className="text-xs text-blue-900 leading-relaxed">
                {selectedItem.recommendedAction}
              </p>
            </div>

            {/* Request Summary Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div>
                <span className="text-gray-400 block text-[10px] uppercase font-semibold">Employee (File)</span>
                <span className="font-semibold text-gray-800">{selectedItem.employeeName}</span>
                {selectedItem.salaryIdentifier && (
                  <span className="block font-mono text-gray-500 text-[11px]">SID: {selectedItem.salaryIdentifier}</span>
                )}
              </div>
              <div>
                <span className="text-gray-400 block text-[10px] uppercase font-semibold">Planday Employee</span>
                <span className="font-semibold text-gray-800">
                  {selectedItem.portalEmployeeName || (selectedItem.systemEmployeeId ? `ID: ${selectedItem.systemEmployeeId}` : "Unmapped / Not Found")}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px] uppercase font-semibold">Leave Account</span>
                <span className="font-semibold text-gray-800">{selectedItem.accountName}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px] uppercase font-semibold">Date & Cost</span>
                <span className="font-semibold text-gray-800">
                  {selectedItem.date || "No Date"} &bull; {selectedItem.cost ?? "0"} {selectedItem.billingMode || ""}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
