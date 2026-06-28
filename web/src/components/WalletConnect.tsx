"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { ritualChain } from "@/config/wagmi";
import { shortenAddress } from "@/lib/format";
import { Button, Badge } from "@/components/ui";

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const wrongChain = isConnected && chainId !== ritualChain.id;

  if (!mounted) return <div style={{ height: 36 }} />;

  if (isConnected && address) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {wrongChain ? (
          <Button
            variant="secondary"
            onClick={() => switchChain({ chainId: ritualChain.id })}
          >
            ⚠ Switch to {ritualChain.name}
          </Button>
        ) : (
          <Badge tone="green">
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block", marginRight: 4, boxShadow: "0 0 6px currentColor" }} />
            {ritualChain.name}
          </Badge>
        )}
        <Button variant="secondary" onClick={() => disconnect()}>
          {shortenAddress(address)}
        </Button>
      </div>
    );
  }

  // Dedupe connectors by name
  const seen = new Set<string>();
  const list = connectors.filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  return (
    <div style={{ position: "relative" }}>
      <Button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
      >
        {isPending ? (
          <>
            <span className="spinner" style={{ width: 12, height: 12 }} />
            Connecting…
          </>
        ) : (
          <>⬡ Connect Wallet</>
        )}
      </Button>

      {open && (
        <div className="wallet-dropdown">
          {list.length === 0 && (
            <div style={{ padding: "10px 16px", fontSize: 12, color: "rgba(0,255,136,0.35)" }}>
              No wallet connectors found.
            </div>
          )}
          {list.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => {
                connect({ connector });
                setOpen(false);
              }}
              className="wallet-option"
            >
              {connector.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
