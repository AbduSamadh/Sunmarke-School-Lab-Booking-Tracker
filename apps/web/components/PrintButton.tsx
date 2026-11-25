"use client";
import { Printer } from "lucide-react";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" className="btn no-print" onClick={() => window.print()}>
      <Printer size={16} aria-hidden="true" /> {label}
    </button>
  );
}
