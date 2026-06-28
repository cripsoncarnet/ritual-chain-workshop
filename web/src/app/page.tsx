"use client";

import { useCallback, useEffect, useState } from "react";
import { WalletConnect } from "@/components/WalletConnect";
import { CreateBountyForm } from "@/components/CreateBountyForm";
import { LoadBountyPanel } from "@/components/LoadBountyPanel";
import { BountyView } from "@/components/BountyView";
import { PlasmaCanvas } from "@/components/PlasmaCanvas";
import { useRecentBounties } from "@/hooks/useRecentBounties";
import { isContractConfigured, contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { shortenAddress } from "@/lib/format";
import { Notice } from "@/components/ui";

export default function Home() {
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const { ids, add } = useRecentBounties();

  useEffect(() => {
    if (selectedId !== null) add(selectedId);
  }, [selectedId, add]);

  const handleCreated = useCallback(
    (id: bigint) => {
      add(id);
      setSelectedId(id);
    },
    [add],
  );

  return (
    <>
      {/* ── Plasma background canvas ── */}
      <PlasmaCanvas />

      {/* ── Holographic grid overlay ── */}
      <div className="holo-grid" />

      {/* ── App shell ── */}
      <div className="app-root">

        {/* ════════════════ HEADER ════════════════ */}
        <header className="cyber-header">
          <div style={{ maxWidth: 1152, margin: "0 auto", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* Brand */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <img
                src="/logo.png"
                alt="AI Bounty Judge Logo"
                className="nav-logo"
              />
              <div className="nav-divider" />
              <div>
                <div className="nav-app-name">AI Bounty Judge</div>
                <div className="nav-chain">on {ritualChain.name}</div>
              </div>
            </div>

            {/* Wallet */}
            <WalletConnect />
          </div>
        </header>

        {/* ════════════════ MAIN ════════════════ */}
        <main style={{ maxWidth: 1152, margin: "0 auto", padding: "0 24px 48px" }}>

          {/* ── HERO ── */}
          <section className="hero-section">
            {/* Floating logo core */}
            <div style={{ marginBottom: 40, display: "flex", justifyContent: "center" }}>
              <div className="logo-core-wrapper">
                {/* Orbital rings */}
                <div className="logo-core-ring" />
                <div className="logo-core-ring" />
                <div className="logo-core-ring" />
                {/* Logo */}
                <img
                  src="/logo.png"
                  alt="AI Bounty Judge Core"
                  className="logo-core-img"
                />
              </div>
            </div>

            {/* Tag line */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <div className="hero-tag">
                <div className="hero-tag-dot" />
                Powered by Ritual Network
              </div>
            </div>

            {/* Headline */}
            <h1 className="hero-title">
              AI-Powered Bounties,{" "}
              <br />
              <span>Judged by Ritual.</span>
            </h1>

            {/* Subtitle */}
            <p className="hero-subtitle">
              Post a bounty with a reward. Participants submit answers on-chain.
              Ritual&apos;s on-chain AI ranks every submission. The owner picks
              the winner and the reward is sent automatically.
            </p>

            {/* Feature pills */}
            <div className="hero-pills">
              <span className="hero-pill">⚡ Up to 15 submissions</span>
              <span className="hero-pill">◈ Category-tagged bounties</span>
              <span className="hero-pill">◎ On-chain AI judging</span>
              <span className="hero-pill">⟁ Instant reward settlement</span>
            </div>
          </section>

          {/* ── CONTRACT WARNING ── */}
          {!isContractConfigured && (
            <div style={{ marginBottom: 24 }}>
              <Notice tone="amber">
                No contract address configured. Copy{" "}
                <code className="monospace">.env.example</code> to{" "}
                <code className="monospace">.env.local</code> and set{" "}
                <code className="monospace">NEXT_PUBLIC_CONTRACT_ADDRESS</code>{" "}
                to start interacting on-chain.
              </Notice>
            </div>
          )}

          {/* ── DASHBOARD GRID ── */}
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
              gap: 20,
            }}
          >
            <CreateBountyForm onCreated={handleCreated} />
            <LoadBountyPanel
              selectedId={selectedId}
              onSelect={setSelectedId}
              recentIds={ids}
            />
          </section>

          {/* ── SELECTED BOUNTY VIEW ── */}
          {selectedId !== null && (
            <section style={{ marginTop: 24 }}>
              <BountyView bountyId={selectedId} />
            </section>
          )}

          {/* ── FOOTER ── */}
          <footer className="cyber-footer">
            {contractAddress ? (
              <>
                Contract&nbsp;
                <span className="monospace">{shortenAddress(contractAddress, 6)}</span>
                &nbsp;·&nbsp;Chain {ritualChain.id}&nbsp;·&nbsp;Ritual Network
              </>
            ) : (
              <>AI Bounty Judge · {ritualChain.name}</>
            )}
          </footer>
        </main>
      </div>
    </>
  );
}
