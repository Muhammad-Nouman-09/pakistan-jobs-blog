// ads.txt line format (IAB): `domain, publisher-id, DIRECT|RESELLER[, certification-authority-id]`,
// plus `#` comments and `NAME=value` variables (CONTACT, SUBDOMAIN, ...). Used as a last-line guard when
// serving the file; the admin form validates the same way before saving.

const RECORD = /^[a-z0-9.-]+\.[a-z]{2,}\s*,\s*[A-Za-z0-9._-]+\s*,\s*(DIRECT|RESELLER)\s*(,\s*[A-Za-z0-9]+\s*)?(#.*)?$/i;
const VARIABLE = /^(CONTACT|SUBDOMAIN|INVENTORYPARTNERDOMAIN|OWNERDOMAIN|MANAGERDOMAIN)\s*=\s*[^\s,][^,]*$/i;

export function validateAdsTxtBasic(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 && lines.length <= 500 && lines.every((l) => l.startsWith("#") || RECORD.test(l) || VARIABLE.test(l));
}
