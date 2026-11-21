import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (session.mustConsent) redirect("/consent");
  if (session.mustChoosePasscode) redirect("/choose-passcode");
  return <AppShell>{children}</AppShell>;
}
