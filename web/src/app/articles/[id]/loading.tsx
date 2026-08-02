export default function ArticleLoading() {
  return (
    <div className="flex flex-col h-screen">
      {/* Breadcrumb skeleton */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-2">
        <div className="h-4 w-64 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* 3-column skeleton */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel skeleton */}
        <aside className="w-64 flex-shrink-0 border-r border-gray-200 bg-gray-50 p-3 space-y-3">
          <div className="h-8 bg-gray-200 rounded animate-pulse" />
          <div className="h-6 bg-gray-100 rounded animate-pulse" />
          <div className="h-6 bg-gray-100 rounded animate-pulse" />
          <div className="h-6 bg-gray-100 rounded animate-pulse" />
        </aside>

        {/* Center skeleton */}
        <main className="flex-1 bg-white px-6 py-4 space-y-3 min-w-0">
          <div className="h-5 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-7 w-32 bg-gray-300 rounded animate-pulse" />
          <div className="space-y-2 mt-6">
            <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-11/12 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-10/12 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-9/12 bg-gray-100 rounded animate-pulse" />
          </div>
        </main>

        {/* Right panel skeleton */}
        <aside className="w-80 flex-shrink-0 border-l border-gray-200 bg-gray-50 p-3 space-y-3">
          <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
          <div className="h-16 bg-gray-100 rounded animate-pulse" />
          <div className="h-16 bg-gray-100 rounded animate-pulse" />
        </aside>
      </div>
    </div>
  );
}
