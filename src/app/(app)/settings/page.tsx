import type { Metadata } from "next";
import { MobileTopBar, PageTitle } from "@/components/page-header";
import { Button, Card } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { GmailConnect } from "./_components/GmailConnect";
import { PushToggle } from "./_components/PushToggle";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const staff = await requireStaff();
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
  const role = staff.role === "pm" ? "Property manager" : staff.role === "gm" ? "General manager" : "Director";

  return (
    <>
      <MobileTopBar staff={staff} />
      <main className="flex max-w-[720px] flex-col gap-6 px-4 py-6 lg:px-10 lg:py-10">
        <PageTitle title="Settings" lead={`${staff.name} · ${role} · ${staff.email}`} />

        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1">
            <h2 className="display text-[20px] leading-tight">Notifications</h2>
            <p className="text-[14px] leading-relaxed text-ink-78">
              The 5pm nudge is two numbers: owners still waiting, and follow-ups due tomorrow. You also hear when an owner has
              waited past their time, and everyone gets the Monday summary.
            </p>
          </div>
          <PushToggle vapidPublicKey={vapidPublicKey} />
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1">
            <h2 className="display text-[20px] leading-tight">Gmail</h2>
            <p className="text-[14px] leading-relaxed text-ink-78">Lane reads owner emails and sends your replies from your own inbox.</p>
          </div>
          <GmailConnect connected={Boolean(staff.gmail_refresh_token)} email={staff.email} />
        </Card>

        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="display text-[20px] leading-tight">Sign out</h2>
            <p className="text-[14px] leading-relaxed text-ink-78">You can sign back in with your Lane Google account any time.</p>
          </div>
          <form action={signOut}>
            <Button type="submit">Sign out</Button>
          </form>
        </Card>
      </main>
    </>
  );
}
