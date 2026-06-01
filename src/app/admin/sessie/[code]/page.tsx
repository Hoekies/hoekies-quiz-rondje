"use client";

import { useParams } from "next/navigation";
import AdminLayout from "../../AdminLayout";
import SessionControl from "../../SessionControl";

export default function HostControlPage() {
  const { code } = useParams<{ code: string }>();
  return (
    <AdminLayout title={`Sessie ${code}`}>
      <SessionControl code={code} />
    </AdminLayout>
  );
}
