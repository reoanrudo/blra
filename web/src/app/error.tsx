"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-2">
        エラーが発生しました
      </h2>
      <p className="text-sm text-gray-500 mb-6 text-center max-w-md">
        {error.message || "予期しないエラーが発生しました。もう一度お試しください。"}
      </p>
      <button
        type="button"
        onClick={reset}
        className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
      >
        再試行
      </button>
    </div>
  );
}
