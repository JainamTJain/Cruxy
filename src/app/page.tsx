import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (session.mustConsent) redirect("/consent");
  if (session.mustSetLearningProfile) redirect("/learning-profile");
  if (session.mustChoosePasscode) redirect("/choose-passcode");
  // Wave 8 G: members land on Today (three things), not the program board.
  redirect("/today");
}
