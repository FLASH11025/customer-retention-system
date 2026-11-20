import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

export default function AppLoading() {
  return (
    <div className="space-y-6 animate-fade-in" aria-busy="true" aria-label="Loading page content">
      <div className="flex items-center justify-between border-b border-signal-hairline pb-5">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-72 rounded-md" />
        </div>
        <Skeleton className="h-10 w-32 rounded-16" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-6 rounded-24 border border-signal-hairline bg-signal-surface space-y-3">
            <Skeleton className="h-4 w-24 rounded-md" />
            <Skeleton className="h-8 w-32 rounded-lg" />
            <Skeleton className="h-3 w-40 rounded-md" />
          </div>
        ))}
      </div>

      <div className="rounded-24 border border-signal-hairline bg-signal-surface p-6 space-y-4">
        <Skeleton className="h-6 w-40 rounded-md" />
        <Skeleton className="h-64 w-full rounded-16" />
      </div>
    </div>
  );
}
