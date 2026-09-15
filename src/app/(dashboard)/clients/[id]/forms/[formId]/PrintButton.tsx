"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn border border-border text-sm">
      Print or save as PDF
    </button>
  );
}
