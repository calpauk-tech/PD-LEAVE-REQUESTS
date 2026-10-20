import React from "react";

interface ProcessingBannerProps {
  isVisible: boolean;
  message?: string;
  subText?: string;
  progress?: number;
}

export const ProcessingBanner: React.FC<ProcessingBannerProps> = ({
  isVisible,
  message = "Processing...",
  subText = "This might take a while if the file is large, please click 'Wait' if the browser prompts you.",
  progress,
}) => {
  if (!isVisible) return null;

  return (
    <>
      {/* Top Viewport Loading Bar (Provides instant feedback across all screen sizes) */}
      <div
        className="fixed top-0 left-0 right-0 z-[100] h-1.5 bg-blue-200 overflow-hidden shadow-sm"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress !== undefined ? progress : undefined}
      >
        {progress !== undefined && progress >= 0 ? (
          <div
            className="h-full bg-blue-600 transition-all duration-300 ease-out"
            style={{ width: `${Math.min(100, Math.max(5, progress))}%` }}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600 animate-pulse" />
        )}
      </div>

      {/* Blue Informational Bottom Banner */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[100] bg-blue-600 text-white px-6 py-4 shadow-2xl flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4 animate-in fade-in transition-all border-t border-blue-500"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center space-x-3.5">
          {/* Clock / Timer SVG Icon with gentle pulse */}
          <svg
            className="h-6 w-6 text-white flex-shrink-0 animate-pulse"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>

          {/* Dynamic task title */}
          <div className="flex items-center gap-2">
            <p className="font-bold text-lg tracking-tight">
              {message || "Processing..."}
            </p>
            {progress !== undefined && (
              <span className="text-xs font-mono bg-blue-700/80 px-2 py-0.5 rounded text-blue-100 font-semibold">
                {Math.round(progress)}%
              </span>
            )}
          </div>
        </div>

        {/* Explanatory notice to prevent user panic */}
        <p className="text-blue-100 text-sm md:border-l md:border-blue-400 md:pl-4 text-center md:text-left leading-snug">
          {subText}
        </p>
      </div>
    </>
  );
};
