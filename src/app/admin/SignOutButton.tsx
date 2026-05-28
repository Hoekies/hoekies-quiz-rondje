"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await signOut(auth);
    router.push("/admin/login");
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-white/40 text-sm hover:text-white/70 transition-colors"
    >
      Uitloggen
    </button>
  );
}
