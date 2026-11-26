import { Suspense } from "react";
import { AppShell } from "@/components/xen/app-shell";
import { ScanNowButton } from "@/components/xen/live-status";
import { UserMenu } from "@/components/xen/user-menu";
import { getCurrentUser } from "@/lib/xen/queries";

// A manual scan runs one real pipeline tick from a Server Function (owner only).
export const maxDuration = 60;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      ownerTools={<Suspense fallback={null}><OwnerTools /></Suspense>}
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

async function OwnerTools() {
  const u = await getCurrentUser();
  return u.role === "owner" ? <ScanNowButton /> : null;
}
