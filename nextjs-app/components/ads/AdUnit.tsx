"use client";
import { useEffect, useRef } from "react";

declare global { interface Window { adsbygoogle?: unknown[] } }

export default function AdUnit({ client, slot, label }: { client: string; slot: string; label: string }) {
  const pushed = useRef(false);
  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* ad blocked or script not loaded */ }
  }, []);
  return (
    <div className="ad-slot" role="complementary" aria-label={label}>
      <span className="ad-label">{label}</span>
      <ins className="adsbygoogle" style={{ display: "block" }} data-ad-client={client} data-ad-slot={slot}
        data-ad-format="auto" data-full-width-responsive="true" />
    </div>
  );
}
