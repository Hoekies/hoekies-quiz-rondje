import { adminAuth } from "@/lib/firebase-admin";
import { headers } from "next/headers";

export async function getAdminUser() {
  try {
    const headersList = await headers();
    const token = headersList.get("x-firebase-token");
    if (!token) return null;
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.rol !== "admin") return null;
    return decoded;
  } catch {
    return null;
  }
}
