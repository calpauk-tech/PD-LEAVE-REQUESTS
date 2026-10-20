import { useState, useCallback } from "react";

export interface HeavyTaskBannerState {
  isProcessing: boolean;
  bannerMessage: string;
  bannerSubText: string;
  progress?: number;
}

export function useHeavyTaskBanner() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [bannerMessage, setBannerMessage] = useState("");
  const [bannerSubText, setBannerSubText] = useState(
    "This might take a while if the file is large, please click 'Wait' if the browser prompts you."
  );
  const [progress, setProgress] = useState<number | undefined>(undefined);

  const runWithBanner = useCallback(
    <T>(
      message: string,
      taskFn: () => T | Promise<T>,
      subText: string = "This might take a while if the file is large, please click 'Wait' if the browser prompts you.",
      initialProgress?: number
    ): Promise<T> => {
      setIsProcessing(true);
      setBannerMessage(message);
      setBannerSubText(subText);
      setProgress(initialProgress);

      return new Promise<T>((resolve, reject) => {
        // Yield to the browser to paint the banner and loading bar first
        setTimeout(async () => {
          try {
            const result = await taskFn();
            resolve(result);
          } catch (error) {
            reject(error);
          } finally {
            setIsProcessing(false);
            setBannerMessage("");
            setProgress(undefined);
          }
        }, 50); // 50ms allows the browser event loop to commit and paint DOM updates
      });
    },
    []
  );

  const updateBanner = useCallback(
    (message: string, currentProgress?: number, subText?: string) => {
      setBannerMessage(message);
      if (currentProgress !== undefined) setProgress(currentProgress);
      if (subText !== undefined) setBannerSubText(subText);
    },
    []
  );

  return {
    isProcessing,
    bannerMessage,
    bannerSubText,
    progress,
    setIsProcessing,
    setBannerMessage,
    setProgress,
    runWithBanner,
    updateBanner,
  };
}
