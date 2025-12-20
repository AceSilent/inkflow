import { useRef, useCallback, useState, useEffect } from 'react';

/**
 * Custom debounce hook with cancellation support
 */
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  options?: {
    leading?: boolean; // Call on leading edge
    trailing?: boolean; // Call on trailing edge
    maxWait?: number; // Maximum time to wait before invoking
  }
): [T, () => void] {
  const timeoutRef = useRef<number | null>(null);
  const maxTimeoutRef = useRef<number | null>(null);
  const lastCallTimeRef = useRef<number>(0);
  const lastInvokeTimeRef = useRef<number>(0);

  const { leading = false, trailing = true, maxWait } = options || {};

  const invokeFunc = useCallback((...args: Parameters<T>) => {
    lastInvokeTimeRef.current = Date.now();
    return callback(...args);
  }, [callback]);

  const shouldInvoke = useCallback(() => {
    const time = Date.now();
    return (
      lastCallTimeRef.current === 0 ||
      time - lastCallTimeRef.current >= delay ||
      (maxWait !== undefined && time - lastInvokeTimeRef.current >= maxWait)
    );
  }, [delay, maxWait]);

  const trailingEdge = useCallback((_time: number, ...args: Parameters<T>) => {
    timeoutRef.current = null;

    if (trailing && lastCallTimeRef.current) {
      return invokeFunc(...args);
    }
    lastCallTimeRef.current = 0;
    return undefined;
  }, [trailing, invokeFunc]);

  const timerExpired = useCallback((...args: Parameters<T>) => {
    const time = Date.now();
    if (shouldInvoke()) {
      return trailingEdge(time, ...args);
    }
    // Restart the timer
    if (timeoutRef.current) {
      const remainingWait = delay - (time - lastCallTimeRef.current);
      timeoutRef.current = setTimeout(() => timerExpired(...args), remainingWait);
    }
  }, [delay, shouldInvoke, trailingEdge]);

  const leadingEdge = useCallback((...args: Parameters<T>) => {
    // Reset any `maxWait` timer
    if (maxTimeoutRef.current) {
      clearTimeout(maxTimeoutRef.current);
    }

    lastInvokeTimeRef.current = Date.now();

    // Start the timer for the trailing edge
    timeoutRef.current = setTimeout(() => timerExpired(...args), delay);

    // Invoke the leading edge
    return leading ? invokeFunc(...args) : undefined;
  }, [delay, leading, invokeFunc, timerExpired, maxWait]);

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      const time = Date.now();
      const isInvoking = shouldInvoke();

      lastCallTimeRef.current = time;

      if (isInvoking) {
        if (timeoutRef.current === null) {
          return leadingEdge(...args);
        }
        if (maxWait !== undefined) {
          // Handle max wait
          timeoutRef.current = setTimeout(() => timerExpired(...args), delay);
          maxTimeoutRef.current = setTimeout(() => {
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
            }
            return invokeFunc(...args);
          }, maxWait);
          return undefined;
        }
      }

      if (timeoutRef.current === null) {
        timeoutRef.current = setTimeout(() => timerExpired(...args), delay);
      }
      return undefined;
    },
    [shouldInvoke, leadingEdge, timerExpired, invokeFunc, delay, maxWait]
  ) as T;

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (maxTimeoutRef.current) {
      clearTimeout(maxTimeoutRef.current);
      maxTimeoutRef.current = null;
    }
    lastCallTimeRef.current = 0;
    lastInvokeTimeRef.current = 0;
  }, []);

  return [debounced, cancel];
}

/**
 * Debounced value hook
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * AI suggestion trigger hook with smart debouncing
 */
export function useAISuggestionTrigger(
  triggerCallback: () => Promise<void>,
  options: {
    delay?: number;
    minTextLength?: number;
    maxWait?: number;
    enabled?: boolean;
  } = {}
) {
  const {
    delay = 2000,
    minTextLength = 10,
    maxWait = 10000,
    enabled = true,
  } = options;

  const lastTriggerTimeRef = useRef<number>(0);
  const isPendingRef = useRef<boolean>(false);

  const [debouncedTrigger, cancelTrigger] = useDebounce(
    async (content: string, cursorPosition: number) => {
      // Guard conditions
      if (!enabled || isPendingRef.current) return;

      // Check minimum content length
      if (content.trim().length < minTextLength) return;

      // Check if we're not at the very beginning of the document
      if (cursorPosition < 5) return;

      // Check minimum time between triggers
      const now = Date.now();
      if (now - lastTriggerTimeRef.current < 5000) return; // 5 seconds minimum between triggers

      // Check recent content - don't trigger if no substantial changes
      const recentContent = content.slice(Math.max(0, cursorPosition - 200), cursorPosition);
      if (recentContent.trim().length < 20) return;

      try {
        isPendingRef.current = true;
        lastTriggerTimeRef.current = now;
        await triggerCallback();
      } catch (error) {
        console.error('AI suggestion trigger failed:', error);
      } finally {
        isPendingRef.current = false;
      }
    },
    delay,
    { maxWait }
  );

  const triggerSuggestion = useCallback(
    (content: string, cursorPosition: number) => {
      if (!enabled) return;
      debouncedTrigger(content, cursorPosition);
    },
    [enabled, debouncedTrigger]
  );

  const cancelPending = useCallback(() => {
    cancelTrigger();
    isPendingRef.current = false;
  }, [cancelTrigger]);

  return {
    triggerSuggestion,
    cancelPending,
    isPending: () => isPendingRef.current,
  };
}