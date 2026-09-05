"use client";

import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { OnboardingModal } from "./OnboardingModal";

/** Muestra el tutorial la primera vez (has_completed_onboarding = false). */
export function OnboardingGate() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    api
      .get<{ has_completed_onboarding: boolean }>("/api/auth/me/")
      .then((r) => {
        if (r.data && r.data.has_completed_onboarding === false) setShow(true);
      })
      .catch(() => {});
  }, []);

  if (!show) return null;
  return <OnboardingModal onDone={() => setShow(false)} />;
}
