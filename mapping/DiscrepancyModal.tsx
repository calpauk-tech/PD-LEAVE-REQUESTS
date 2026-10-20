import React, { useState } from "react";
import { AlertTriangle, X, ShieldAlert, Check } from "lucide-react";
import { DiscrepancyItem } from "./types";

interface DiscrepancyModalProps {
  discrepancies: DiscrepancyItem[];
  onIgnoreAndProceed: () => void;
  onCancel: () => void;
}

export const DiscrepancyModal: React.FC<DiscrepancyModalProps> = ({
  discrepancies,
  onIgnoreAndProceed,
  onCancel,
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = discrepancies.filter(
    (d) =>
      d.idValue.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.expectedName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.uploadedName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(d.rowNumber).includes(searchTerm),
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full border border-amber-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-amber-50 px-6 py-4 border-b border-amber-200 flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                Identity Discrepancies Detected
              </h3>
              <p className="text-xs text-amber-800 mt-0.5">
                {discrepancies.length} {discrepancies.length === 1 ? "row has" : "rows have"} a name in the file that does not match the database employee for that ID.
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6">
          <div className="bg-amber-50/70 border border-amber-200 text-amber-900 text-sm p-3.5 rounded-lg mb-4 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Safeguard Cross-Check:</strong> You selected ID matching, but the uploaded name does not match the database record for this ID.
              If you proceed, updates will be applied to the <em>database employee matching the ID</em>.
            </div>
          </div>

          {/* Search bar */}
          <div className="mb-3 flex justify-between items-center gap-4">
            <input
              type="text"
              placeholder="Filter discrepancies by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-sm px-3 py-1.5 border border-gray-300 rounded-md w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-500">
              Showing {filtered.length} of {discrepancies.length}
            </span>
          </div>

          {/* Table */}
          <div className="border border-gray-200 rounded-lg max-h-72 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                    Row #
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                    ID in File
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-amber-800 uppercase bg-amber-50/50">
                    Name in File
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-green-800 uppercase bg-green-50/50">
                    Database Name (Expected)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map((item) => (
                  <tr key={item.rowIndex} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs font-mono text-gray-600">
                      Row {item.rowNumber}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-900">
                      {item.idValue || "—"}
                    </td>
                    <td className="px-3 py-2 text-amber-900 font-medium bg-amber-50/30">
                      {item.uploadedName || "(Empty)"}
                    </td>
                    <td className="px-3 py-2 text-green-900 font-medium bg-green-50/30">
                      {item.expectedName}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-gray-500 text-xs">
                      No matching discrepancies found for "{searchTerm}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
          >
            Go Back & Review File
          </button>
          <button
            type="button"
            onClick={onIgnoreAndProceed}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Ignore Discrepancies & Proceed
          </button>
        </div>
      </div>
    </div>
  );
};
