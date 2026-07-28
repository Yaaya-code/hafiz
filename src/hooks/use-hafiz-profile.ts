"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDefaultProfile,
  loadProfile,
  saveProfile,
  type HafizProfile,
} from "@/lib/user-profile";

/**
 * Shared local profile store.
 * Never persist/broadcast inside React setState updaters — that can notify
 * sibling hooks (e.g. AppHeader) while another page is still rendering.
 */
export function useHafizProfile() {
  const [profile, setProfile] = useState<HafizProfile>(getDefaultProfile);
  const [ready, setReady] = useState(false);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    const loaded = loadProfile();
    profileRef.current = loaded;
    setProfile(loaded);
    setReady(true);

    const onUpdate = () => {
      const next = loadProfile();
      profileRef.current = next;
      setProfile(next);
    };

    window.addEventListener("hafiz-profile-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("hafiz-profile-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const update = useCallback(
    (next: HafizProfile | ((p: HafizProfile) => HafizProfile)) => {
      const prev = profileRef.current;
      const value = typeof next === "function" ? next(prev) : next;
      profileRef.current = value;
      // Local React state only — pure update
      setProfile(value);
      // Persist + notify peers after the current call stack / render settles
      queueMicrotask(() => {
        saveProfile(value);
      });
    },
    []
  );

  return { profile, ready, update, setProfile: update };
}
