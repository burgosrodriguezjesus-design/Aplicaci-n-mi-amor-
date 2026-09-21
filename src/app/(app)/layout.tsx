import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { publicCapabilities } from "@/lib/env";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

/** Todas las pantallas internas requieren sesión iniciada. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell user={user} capabilities={publicCapabilities()}>
      {children}
    </AppShell>
  );
}
