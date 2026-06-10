"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clearAllData } from "@/lib/api";

type Phase = "idle" | "confirm" | "clearing";

export default function ClearDataButton() {
  const [phase, setPhase] = useState<Phase>("idle");
  const queryClient = useQueryClient();

  async function handleClear() {
    setPhase("clearing");
    try {
      await clearAllData();
      queryClient.clear();
      localStorage.clear();
      window.location.replace("/");
    } catch {
      setPhase("idle");
    }
  }

  if (phase === "confirm") {
    return (
      <div className="fixed bottom-4 left-4 z-50 bg-white border border-red-200 rounded-2xl shadow-lg px-4 py-3 flex flex-col gap-2.5 min-w-52">
        <p className="text-xs font-semibold text-red-700 leading-snug">
          Delete all jobs, files &amp; queue?
          <br />
          <span className="font-normal text-red-500">This cannot be undone.</span>
        </p>
        <div className="flex gap-2">
          <button onClick={handleClear} className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-lg py-1.5 text-xs font-semibold transition">
            Yes, clear all
          </button>
          <button onClick={() => setPhase("idle")} className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg py-1.5 text-xs transition">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setPhase("confirm")}
      disabled={phase === "clearing"}
      className="fixed bottom-4 left-4 z-50 bg-white border border-gray-200 rounded-2xl shadow-lg px-4 py-3 text-sm text-red-500 hover:text-red-700 hover:border-red-300 hover:bg-red-50 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {phase === "clearing" ? "Clearing…" : "🗑 Clear All"}
    </button>
  );
}
