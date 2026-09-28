"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui/primitives";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "checking" | "unsupported" | "off" | "on" | "blocked" | "working";

/**
 * One switch per device. On: registers the service worker, subscribes with
 * the VAPID key and saves the subscription. Off: unsubscribes and forgets it.
 */
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<State>("checking");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    if (!vapidPublicKey) {
      setNote("Push is not set up on the server yet.");
      return;
    }
    setState("working");
    setNote(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: JSON.parse(JSON.stringify(sub)) }),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
      setState("on");
    } catch (err) {
      console.warn("[push] subscribe failed", err);
      setNote("That did not work. Try again in a moment.");
      setState("off");
    }
  }

  async function turnOff() {
    setState("working");
    setNote(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (err) {
      console.warn("[push] unsubscribe failed", err);
      setNote("That did not work. Try again in a moment.");
      setState("on");
    }
  }

  const on = state === "on";
  const disabled = state === "checking" || state === "working" || state === "unsupported" || state === "blocked";

  const status =
    state === "unsupported"
      ? "This browser cannot show notifications. On an iPhone, add Lane to the home screen first."
      : state === "blocked"
        ? "Notifications are blocked for Lane in this browser's settings."
        : state === "checking"
          ? "Checking this device"
          : on
            ? "On for this device"
            : "Off for this device";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[15px] text-ink">{status}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Push notifications on this device"
          disabled={disabled}
          onClick={on ? turnOff : turnOn}
          className={cx(
            "relative inline-flex h-11 w-[68px] shrink-0 items-center rounded-full p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
            on ? "bg-navy" : "bg-hairline",
          )}
        >
          <span
            aria-hidden="true"
            className={cx("h-9 w-9 rounded-full bg-card transition-transform", on ? "translate-x-[24px]" : "translate-x-0")}
          />
        </button>
      </div>
      {note ? <p className="text-[13px] text-ink-66">{note}</p> : null}
    </div>
  );
}
