"use client";

/**
 * Client hook: load today's plan (+ week/month horizon) via @/application only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateJourneyPlan,
  getTodayPlan,
  type JourneyPlanResult,
  type TodayPlanResult,
} from "@/application";
import {
  mapOrchestrationToDashboard,
  type DashboardPlanView,
} from "@/application/mappers/plan-to-dashboard";
import { LEARNING_SNAPSHOT_EVENT } from "@/application";

export type OrchestratedPlanState = {
  ready: boolean;
  error: string | null;
  today: TodayPlanResult | null;
  week: JourneyPlanResult | null;
  month: JourneyPlanResult | null;
  view: DashboardPlanView | null;
  refresh: (force?: boolean) => void;
};

export function useOrchestratedPlan(): OrchestratedPlanState {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<TodayPlanResult | null>(null);
  const [week, setWeek] = useState<JourneyPlanResult | null>(null);
  const [month, setMonth] = useState<JourneyPlanResult | null>(null);
  const [view, setView] = useState<DashboardPlanView | null>(null);

  /**
   * Re-entrancy guard: each getTodayPlan / generateJourneyPlan save emits
   * LEARNING_SNAPSHOT_EVENT. Without this, Journey mount → save → load again
   * nested mid-flight (state thrash).
   */
  const loadInFlight = useRef(false);

  const load = useCallback((force = false) => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    try {
      // Today first (may commit durable 1-day state). Horizons are display-only.
      const todayResult = getTodayPlan({ force });
      // Multi-day never force from dashboard/journey mount — use cache when valid.
      const weekResult = generateJourneyPlan({
        days: 7,
        force: false,
      });
      const monthResult = generateJourneyPlan({
        days: 30,
        force: false,
      });
      const mapped = mapOrchestrationToDashboard({
        today: todayResult,
        week: weekResult,
        month: monthResult,
      });
      setToday(todayResult);
      setWeek(weekResult);
      setMonth(monthResult);
      setView(mapped);
      setError(null);
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل الخطة");
      setReady(true);
    } finally {
      loadInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    load(false);
    const onSnap = () => load(false);
    /** Profile capacity/scope change → full force replan */
    const onProfile = () => load(true);
    window.addEventListener(LEARNING_SNAPSHOT_EVENT, onSnap);
    window.addEventListener("hafiz-profile-updated", onProfile);
    // Journey step completion is progress UI only — do not re-orchestrate plan
    // (was triggering load → recompute side effects on every step mark).
    return () => {
      window.removeEventListener(LEARNING_SNAPSHOT_EVENT, onSnap);
      window.removeEventListener("hafiz-profile-updated", onProfile);
    };
  }, [load]);

  return {
    ready,
    error,
    today,
    week,
    month,
    view,
    refresh: load,
  };
}
