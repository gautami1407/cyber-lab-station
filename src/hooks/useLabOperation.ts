import { useCallback, useEffect, useRef, useState } from "react";
import { cancelOperation, getOperation } from "@/services/scannerService";
import type { OperationHandle, OperationState } from "@/types";

export function useLabOperation<T>() {
  const [state, setState] = useState<OperationState>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [opStatus, setOpStatus] = useState<"queued" | "running" | "completed" | "failed" | "cancelled" | null>(
    null,
  );
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveFailures = useRef(0);
  const MAX_POLL_FAILURES = 5;

  const clear = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    consecutiveFailures.current = 0;
  }, []);

  useEffect(() => clear, [clear]);

  const poll = useCallback(
    async (id: string) => {
      try {
        const snapshot = await getOperation<T>(id);
        consecutiveFailures.current = 0;
        setOpStatus(snapshot.status);
        if (snapshot.progressTotal > 0) {
          setProgress(Math.round((snapshot.progressDone / snapshot.progressTotal) * 100));
        } else {
          setProgress(null);
        }
        if (snapshot.status === "completed") {
          clear();
          setData(snapshot.result);
          setState("success");
        } else if (snapshot.status === "failed") {
          clear();
          setState("error");
          setError(snapshot.error ?? "The operation failed.");
        } else if (snapshot.status === "cancelled") {
          clear();
          setState("idle");
          setProgress(null);
        }
      } catch (err) {
        consecutiveFailures.current += 1;
        if (consecutiveFailures.current >= MAX_POLL_FAILURES) {
          clear();
          setState("error");
          setOpStatus(null);
          setError(
            err instanceof Error
              ? err.message
              : "Lost contact with the backend while polling for results.",
          );
        }
        // else silently retry up to MAX_POLL_FAILURES times
      }
    },
    [clear],
  );

  const start = useCallback(
    async (create: () => Promise<OperationHandle>) => {
      clear();
      setState("loading");
      setError(null);
      setData(null);
      setProgress(null);
      setOpStatus("queued");
      try {
        const handle = await create();
        setOperationId(handle.operationId);
        timer.current = setInterval(() => {
          void poll(handle.operationId);
        }, 800);
        await poll(handle.operationId);
      } catch (err) {
        setState("error");
        setOpStatus(null);
        setError(err instanceof Error ? err.message : "The operation could not be started.");
      }
    },
    [clear, poll],
  );

  const stop = useCallback(async () => {
    if (operationId) await cancelOperation(operationId);
    clear();
    setState("idle");
    setProgress(null);
  }, [clear, operationId]);

  const reset = useCallback(() => {
    clear();
    setState("idle");
    setProgress(null);
    setData(null);
    setError(null);
    setOperationId(null);
    setOpStatus(null);
  }, [clear]);

  return { state, progress, opStatus, data, error, start, stop, reset };
}
