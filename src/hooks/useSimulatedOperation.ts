import { useCallback, useEffect, useRef, useState } from "react";
import type { OperationState } from "@/types";

/**
 * Drives a demo operation: progress animation + idle/loading/success/error
 * states. Replace `run` with a real service call when the backend lands.
 */
export function useSimulatedOperation<T>() {
  const [state, setState] = useState<OperationState>("idle");
  const [progress, setProgress] = useState(0);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const start = useCallback(
    async (operation: () => Promise<T>, durationMs = 3200) => {
      cancelledRef.current = false;
      clearTimer();
      setState("loading");
      setError(null);
      setData(null);
      setProgress(0);

      const step = 100 / (durationMs / 120);
      timerRef.current = setInterval(() => {
        setProgress((p) => Math.min(96, p + step));
      }, 120);

      try {
        const [result] = await Promise.all([
          operation(),
          new Promise((resolve) => setTimeout(resolve, durationMs)),
        ]);
        if (cancelledRef.current) return;
        clearTimer();
        setProgress(100);
        setData(result);
        setState("success");
      } catch (err) {
        if (cancelledRef.current) return;
        clearTimer();
        setState("error");
        setError(
          err instanceof Error
            ? err.message
            : "The operation could not be completed. Please try again.",
        );
      }
    },
    [clearTimer],
  );

  const stop = useCallback(() => {
    cancelledRef.current = true;
    clearTimer();
    setState("idle");
    setProgress(0);
  }, [clearTimer]);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    clearTimer();
    setState("idle");
    setProgress(0);
    setData(null);
    setError(null);
  }, [clearTimer]);

  return { state, progress, data, error, start, stop, reset };
}
