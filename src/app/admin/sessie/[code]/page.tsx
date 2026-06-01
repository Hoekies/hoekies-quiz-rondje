"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Beheer gebeurt voortaan volledig via het dashboard. Deze route stuurt door.
export default function HostControlRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin"); }, [router]);
  return null;
}
