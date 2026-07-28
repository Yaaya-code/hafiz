"use client";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { SyncProgressProvider } from "@/hooks/use-sync-progress";
import { AudioProvider } from "@/components/providers/audio-provider";
import { AuthProvider } from "@/hooks/use-auth";
import { PwaRegister } from "@/components/pwa-register";
import { AudioNoticeToast } from "@/components/audio-notice-toast";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AuthProvider>
        <AudioProvider>
          <SyncProgressProvider>
            {children}
            <AudioNoticeToast />
            <PwaRegister />
          </SyncProgressProvider>
        </AudioProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
