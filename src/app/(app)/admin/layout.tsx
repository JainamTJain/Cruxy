import type { ReactNode } from "react";
import { AdminViewGuard } from "@/components/admin/admin-view-guard";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminViewGuard>{children}</AdminViewGuard>;
}
