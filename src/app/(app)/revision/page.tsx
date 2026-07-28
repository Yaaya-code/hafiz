import { redirect } from "next/navigation";

/**
 * Legacy "Revision Engine" removed.
 * All revision happens in the journey session page.
 */
export default function RevisionRedirectPage() {
  redirect("/plans/journey");
}
