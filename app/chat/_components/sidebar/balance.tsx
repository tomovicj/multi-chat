"use client";

import { Button } from "@/components/ui/button";
import { getUserBalance } from "@/lib/actions/user";
import { RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";

export function Balance() {
  const [balance, setBalance] = useState<number | null>(null);
  // Bumped by the refresh button to re-run the effect below. Keeping the fetch
  // in one place avoids a second copy of it in the click handler.
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getUserBalance().then((bal) => {
      if (!cancelled) {
        setBalance(bal);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [refreshCount]);

  if (balance === null) {
    return <p>Loading balance...</p>;
  }

  return (
    <div className="flex items-center justify-end gap-1 mt-1 -mb-2">
      <p>Balance: {balance}</p>
      <Button
        onClick={() => setRefreshCount((count) => count + 1)}
        size="icon"
        variant="ghost"
      >
        <RefreshCw />
      </Button>
    </div>
  );
}
