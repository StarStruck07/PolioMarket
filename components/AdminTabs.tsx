"use client";

import { useState, type ReactNode } from "react";

export default function AdminTabs({
  create,
  manage,
}: {
  create: ReactNode;
  manage: ReactNode;
}) {
  const [tab, setTab] = useState<"create" | "manage">("create");
  return (
    <>
      <div className="tabs">
        <button className={tab === "create" ? "tab active" : "tab"} onClick={() => setTab("create")}>
          ➕ Create
        </button>
        <button className={tab === "manage" ? "tab active" : "tab"} onClick={() => setTab("manage")}>
          🗂 Manage
        </button>
      </div>
      <div>{tab === "create" ? create : manage}</div>
    </>
  );
}
