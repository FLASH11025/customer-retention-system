import React from "react";
import Link from "next/link";
import { Button } from "./Button";
import { ArrowUpRightIcon } from "./Icons";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionText?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionText,
  actionHref,
  onAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`rounded-24 border border-dashed border-signal-hairline bg-signal-surface/50 p-12 text-center flex flex-col items-center justify-center max-w-xl mx-auto my-8 ${className}`}
    >
      {icon && (
        <div className="w-12 h-12 rounded-full bg-signal-surface border border-signal-hairline flex items-center justify-center text-signal-muted mb-4 shadow-sm">
          {icon}
        </div>
      )}
      <h3 className="font-display italic text-2xl text-signal-ink mb-2">
        {title}
      </h3>
      <p className="text-sm text-signal-muted max-w-md mb-6 leading-relaxed">
        {description}
      </p>

      {actionText && actionHref && (
        <Link href={actionHref}>
          <Button variant="primary" icon={<ArrowUpRightIcon size={16} />}>
            {actionText}
          </Button>
        </Link>
      )}

      {actionText && onAction && !actionHref && (
        <Button
          variant="primary"
          onClick={onAction}
          icon={<ArrowUpRightIcon size={16} />}
        >
          {actionText}
        </Button>
      )}
    </div>
  );
}
