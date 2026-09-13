"use client";

import { useState, type ReactNode } from "react";

export default function AdminTabs({
  tabs,
}: {
  tabs: { key: string; label: string; node: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <>
      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={t.key === active ? "tab active" : "tab"}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>{current?.node}</div>
    </>
  );
}
