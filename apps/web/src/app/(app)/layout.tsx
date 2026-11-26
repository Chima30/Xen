import { Suspense } from "react";
import { AppShell } from "@/components/xen/app-shell";
import { UserMenu } from "@/components/xen/user-menu";
import { getCurrentUser } from "@/lib/xen/queries";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      userMenu={
        <Suspense fallback={<span className="size-7 rounded-full bg-muted" aria-hidden />}>
          <AccountMenu />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}

async function AccountMenu() {
  const u = await getCurrentUser();
  return <UserMenu email={u.email} name={u.displayName} role={u.role} />;
}
