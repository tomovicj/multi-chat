"use client";

import { Button } from "@/components/ui/button";
import { getUserBalance } from "@/lib/actions/user";
import { RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";

export function Balance({ userId }: { userId: string }) {
  const [balance, setBalance] = useState<number | null>(null);

  const fetchBalance = async () => {
    getUserBalance(userId).then((bal) => setBalance(bal));
  };

  useEffect(() => {
    fetchBalance();
  }, [userId]);

  if (balance === null) {
    return <p>Loading balance...</p>;
  }

  return (
    <div className="flex items-center justify-end gap-1 mt-1 -mb-2">
      <p>Balance: {balance}</p>
      <Button onClick={fetchBalance} size="icon" variant="ghost">
        <RefreshCw />
      </Button>
    </div>
  );
}
