"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { formatMicros } from "@/lib/money";

/**
 * Presentational. The balance arrives as a prop from the server-rendered
 * sidebar, so the `router.refresh()` the chat already runs when a reply
 * finishes updates it — no polling, and no window where the number is stale
 * because the deduction had not committed yet.
 */
export function Balance({ micros }: { micros: number }) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();

  return (
    <div className="flex items-center justify-end gap-1 mt-1 -mb-2">
      <p>Balance: {formatMicros(micros)}</p>
      <Button
        onClick={() => startRefresh(() => router.refresh())}
        size="icon"
        variant="ghost"
        disabled={isRefreshing}
        aria-label="Refresh balance"
      >
        <RefreshCw className={isRefreshing ? "animate-spin" : undefined} />
      </Button>
    </div>
  );
}
