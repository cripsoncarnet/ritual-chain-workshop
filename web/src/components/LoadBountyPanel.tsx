"use client";

import { useState } from "react";
import { Card, CardHeader, CardBody, Field, Input, Button } from "@/components/ui";

export function LoadBountyPanel({
  selectedId,
  onSelect,
  recentIds,
}: {
  selectedId: bigint | null;
  onSelect: (id: bigint | null) => void;
  recentIds: string[];
}) {
  // `override === null` => show the current selection; typing takes over.
  const [override, setOverride] = useState<string | null>(null);
  const value =
    override ?? (selectedId !== null ? selectedId.toString() : "");

  function load(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      onSelect(null);
      return;
    }
    try {
      const id = BigInt(trimmed);
      if (id < 0n) return;
      onSelect(id);
    } catch {
      /* not a number — ignore */
    }
  }

  return (
    <Card>
      <CardHeader
        title="Load a bounty"
        subtitle="Open any bounty by its numeric id."
      />
      <CardBody className="space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(value);
          }}
          className="flex items-end gap-2"
        >
          <div className="flex-1">
            <Field label="Bounty id">
              <Input
                inputMode="numeric"
                value={value}
                onChange={(e) => setOverride(e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
          <Button type="submit">Load</Button>
        </form>

        {recentIds.length > 0 && (
          <div>
            <div style={{ marginBottom: 6, fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(0,255,136,0.38)" }}>
              Recent
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {recentIds.map((id) => (
                <button
                  key={id}
                  onClick={() => {
                    setOverride(null);
                    load(id);
                  }}
                  className={`bounty-pill ${
                    selectedId?.toString() === id
                      ? "bounty-pill-active"
                      : "bounty-pill-inactive"
                  }`}
                >
                  #{id}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
