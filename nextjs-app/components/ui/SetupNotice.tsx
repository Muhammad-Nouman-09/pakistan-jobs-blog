import type { TFunction } from "@/lib/i18n";

export default function SetupNotice({ t }: { t: TFunction }) {
  return <p className="notice warn" role="alert">{t("common.configMissing")}</p>;
}
