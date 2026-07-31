/**
 * navigation-stub — Next.js useRouter/usePathname/useSearchParams の Vite 用スタブ。
 * hourei-rag からの移植時に next/navigation を置き換える。
 */
import { useCallback } from "react";

export function useRouter() {
  return {
    push: useCallback((url: string) => {
      window.location.href = url;
    }, []),
    replace: useCallback((url: string) => {
      window.location.replace(url);
    }, []),
    back: useCallback(() => {
      window.history.back();
    }, []),
    prefetch: useCallback(() => {}, []),
  };
}

export function usePathname(): string {
  return window.location.pathname;
}

export function useSearchParams() {
  return new URLSearchParams(window.location.search);
}
