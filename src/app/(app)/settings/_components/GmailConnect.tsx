import { ButtonLink } from "@/components/ui/primitives";

/** Shows whether this staff member's inbox is connected and offers the connect link. */
export function GmailConnect({ connected, email }: { connected: boolean; email: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <span className="text-[15px] text-ink">{connected ? `Connected as ${email}` : "Not connected"}</span>
        <span className="text-[13px] text-ink-66">
          {connected
            ? "Replies you send from Lane go out from your own inbox."
            : "Connect your inbox so replies go out from you and owner emails open loops."}
        </span>
      </div>
      <ButtonLink href="/api/integrations/gmail/connect" variant={connected ? "secondary" : "primary"}>
        {connected ? "Reconnect" : "Connect Gmail"}
      </ButtonLink>
    </div>
  );
}
