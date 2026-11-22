import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { RegionalClient } from "@/components/regional/regional-client";

export default async function RegionalPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return <RegionalClient />;
}
