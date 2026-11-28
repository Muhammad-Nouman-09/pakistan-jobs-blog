"use client";

export default function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-dark btn-small" onClick={() => window.print()}>
      {label}
    </button>
  );
}
