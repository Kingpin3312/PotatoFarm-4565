import { redirect } from "next/navigation";
import { auth } from "@/server/auth/config";
import { Shell } from "@/components/layout/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Signed in by the email link but not yet by the code: nothing in the
  // app renders until they have typed it. The API refuses them anyway
  // (`orgProcedure`); this sends them somewhere that says why.
  const session = await auth();
  if (session?.twoStep === "needed") redirect("/sign-in/two-step");
  return <Shell>{children}</Shell>;
}
