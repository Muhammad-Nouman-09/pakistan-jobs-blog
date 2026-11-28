"use client";
import type { ButtonHTMLAttributes } from "react";

/** Submit button that asks for confirmation first (destructive / irreversible actions). */
export default function ConfirmButton({ message, children, ...rest }: { message: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} type="submit" onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
