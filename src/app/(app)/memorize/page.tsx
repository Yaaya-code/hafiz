import { redirect } from "next/navigation";

/** وضع الحفظ المنفصل أُلغي — يوجّه لورد الحفظ */
export default function MemorizeRedirect() {
  redirect("/plans/new");
}
