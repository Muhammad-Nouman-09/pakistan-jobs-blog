import { initials, publicStorageUrl } from "@/lib/utils";

/** Company logo from the public bucket, or the initials avatar. Decorative (the name is always next to it). */
export default function CompanyLogo({ name, path, large }: { name: string; path: string | null | undefined; large?: boolean }) {
  const url = publicStorageUrl("company-logos", path);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="logo-img" src={url} alt="" width={large ? 72 : 48} height={large ? 72 : 48} style={large ? { width: 72, height: 72 } : undefined} />;
  }
  return <span className="job-avatar" aria-hidden="true" style={large ? { width: 72, height: 72, fontSize: 20 } : undefined}>{initials(name)}</span>;
}
