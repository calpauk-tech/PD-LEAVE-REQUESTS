import React, { useEffect } from "react";

export interface TablePaginationBarProps {
  totalItems: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  rowsPerPage: number | "ALL";
  onRowsPerPageChange: (size: number | "ALL") => void;
  pageSizeOptions?: (number | "ALL")[];
}

export const TablePaginationBar: React.FC<TablePaginationBarProps> = ({
  totalItems,
  currentPage,
  onPageChange,
  rowsPerPage,
  onRowsPerPageChange,
  pageSizeOptions = [25, 50, 100, "ALL"],
}) => {
  const actualRowsPerPage =
    rowsPerPage === "ALL" ? Math.max(1, totalItems) : rowsPerPage;
  const totalPages = Math.max(1, Math.ceil(totalItems / actualRowsPerPage));

  const startRecord =
    totalItems === 0 ? 0 : (currentPage - 1) * actualRowsPerPage + 1;
  const endRecord = Math.min(currentPage * actualRowsPerPage, totalItems);

  // Guard against currentPage going out of bounds if data shrinks
  useEffect(() => {
    if (currentPage > totalPages) {
      onPageChange(totalPages);
    }
  }, [currentPage, totalPages, onPageChange]);

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 border-t-0 rounded-b-lg">
      {/* Mobile Controls */}
      <div className="flex flex-1 justify-between sm:hidden">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>

      {/* Desktop Controls */}
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-600 font-medium">
              Rows per page:
            </label>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                const val =
                  e.target.value === "ALL"
                    ? "ALL"
                    : parseInt(e.target.value, 10);
                onRowsPerPageChange(val);
                onPageChange(1);
              }}
              className="text-sm border border-gray-300 rounded-md py-1 px-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === "ALL" ? "All" : opt}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{startRecord}</span> to{" "}
            <span className="font-medium">{endRecord}</span> of{" "}
            <span className="font-medium">{totalItems}</span> results
          </p>
        </div>

        <div>
          <nav
            className="isolate inline-flex -space-x-px rounded-md shadow-sm"
            aria-label="Pagination"
          >
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              <span className="sr-only">Previous</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <span className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              <span className="sr-only">Next</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
};
