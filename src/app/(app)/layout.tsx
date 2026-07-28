import { AppShell } from "@/components/layout/app-shell";
import { OnboardingGate } from "@/components/layout/onboarding-gate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <OnboardingGate>{children}</OnboardingGate>
    </AppShell>
  );
}
