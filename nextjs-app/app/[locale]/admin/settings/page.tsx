import { redirect } from "next/navigation";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../_ctx";

export default async function AdminSettingsIndex(props: PageProps) {
  const { path } = await adminPage(props);
  redirect(path("/settings/general"));
}
