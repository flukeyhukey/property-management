import { requireStaff } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const staff = await requireStaff();
  return <AppShell staff={staff}>{children}</AppShell>;
}
