import React from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";

interface FileUploadLoadingIndicatorProps {
  fileName?: string;
  fileSize?: number;
  progress?: number;
  statusText?: string;
}

export const FileUploadLoadingIndicator: React.FC<FileUploadLoadingIndicatorProps> = ({
  fileName = "spreadsheet",
  fileSize,
  progress,
  statusText = "Reading & analyzing spreadsheet...",
}) => {
  const formattedSize = fileSize
    ? fileSize > 1024 * 1024
      ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(fileSize / 1024)} KB`
    : null;

  return (
    <div className="border-2 border-blue-400 bg-blue-50/60 rounded-xl p-8 sm:p-10 text-center transition-all animate-in fade-in shadow-xs">
      <div className="max-w-md mx-auto flex flex-col items-center">
        {/* Animated icon circle */}
        <div className="relative mb-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-inner">
            <FileSpreadsheet className="w-8 h-8 animate-pulse text-blue-600" />
          </div>
          <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow-sm">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          </div>
        </div>

        {/* File name & size badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white border border-blue-200 rounded-full text-xs font-semibold text-blue-900 mb-3 shadow-xs max-w-full truncate">
          <span className="truncate">{fileName}</span>
          {formattedSize && (
            <span className="text-blue-500 font-mono text-[11px] font-normal">
              ({formattedSize})
            </span>
          )}
        </div>

        <h3 className="text-base font-bold text-gray-900 mb-1">
          {statusText}
        </h3>
        <p className="text-xs text-gray-500 mb-5 max-w-sm">
          Processing rows, parsing date formats, and preparing mapping options.
        </p>

        {/* Loading Bar */}
        <div className="w-full bg-blue-100 rounded-full h-3 overflow-hidden p-0.5 border border-blue-200 shadow-inner">
          {progress !== undefined && progress >= 0 ? (
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.min(100, Math.max(8, progress))}%` }}
            />
          ) : (
            <div className="relative w-full h-full rounded-full overflow-hidden">
              <div className="absolute inset-0 bg-blue-600 w-full animate-pulse" />
              <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.25)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.25)_50%,rgba(255,255,255,0.25)_75%,transparent_75%,transparent)] bg-[length:24px_24px] animate-[move-stripe_1s_linear_infinite]" />
            </div>
          )}
        </div>

        <div className="flex justify-between w-full mt-2 text-[11px] font-medium text-blue-700">
          <span>Parsing spreadsheet</span>
          <span>{progress !== undefined ? `${Math.round(progress)}%` : "Working..."}</span>
        </div>

        <p className="mt-4 text-[11px] text-gray-400 italic">
          If your file contains thousands of records, this may take a moment.
        </p>
      </div>
    </div>
  );
};
