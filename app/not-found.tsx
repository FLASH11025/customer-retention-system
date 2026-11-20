import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-signal-bg text-center">
      <div className="w-16 h-16 rounded-full bg-signal-surface border border-signal-hairline flex items-center justify-center text-signal-muted mb-4 shadow-sm font-mono text-xl font-bold">
        404
      </div>

      <h1 className="font-display italic text-4xl text-signal-ink mb-2">
        Page Not Found
      </h1>
      <p className="text-sm text-signal-muted max-w-md mb-6 leading-relaxed">
        The destination you are trying to reach does not exist or has moved.
      </p>

      <Link href="/">
        <Button variant="primary">Return to Overview</Button>
      </Link>
    </div>
  );
}
