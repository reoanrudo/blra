"use client";

import { useRouter } from "next/navigation";

export default function ArticleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-2">
        条文の読み込みに失敗しました
      </h2>
      <p className="text-sm text-gray-500 mb-6 text-center max-w-md">
        {error.message || "条文データを取得できませんでした。"}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
        >
          再試行
        </button>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="px-5 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
        >
          ホームに戻る
        </button>
      </div>
    </div>
  );
}
