import { describe, expect, it } from "vitest";
import {
  closesLoop,
  issueKeywords,
  loopTypeForInbound,
  marksTextedNotCalled,
  mentionsIssue,
  waitingTitle,
  type InteractionLike,
  type LoopLike,
} from "./loops";

const bris = (s: string) => new Date(`${s}+10:00`);

function interaction(over: Partial<InteractionLike>): InteractionLike {
  return {
    channel: "email",
    direction: "outbound",
    is_auto_reply: false,
    call_answered: null,
    thread_id: null,
    subject: null,
    body: null,
    ai_summary: null,
    staff_id: "staff-1",
    metadata: {},
    ...over,
  };
}

function loop(over: Partial<LoopLike>): LoopLike {
  return { type: "email", status: "open", thread_id: null, issue_id: null, texted_not_called: false, ...over };
}

describe("loopTypeForInbound", () => {
  it("opens an email loop for an inbound email", () => {
    expect(loopTypeForInbound({ channel: "email", direction: "inbound", is_auto_reply: false, call_answered: null })).toBe("email");
  });
  it("ignores auto-replies", () => {
    expect(loopTypeForInbound({ channel: "email", direction: "inbound", is_auto_reply: true, call_answered: null })).toBeNull();
  });
  it("opens a missed call loop only when the call was not answered", () => {
    expect(loopTypeForInbound({ channel: "call", direction: "inbound", is_auto_reply: false, call_answered: false })).toBe("missed_call");
    expect(loopTypeForInbound({ channel: "call", direction: "inbound", is_auto_reply: false, call_answered: true })).toBeNull();
  });
  it("opens an sms loop for an inbound sms", () => {
    expect(loopTypeForInbound({ channel: "sms", direction: "inbound", is_auto_reply: false, call_answered: null })).toBe("sms");
  });
  it("never opens from outbound or internal", () => {
    expect(loopTypeForInbound({ channel: "email", direction: "outbound", is_auto_reply: false, call_answered: null })).toBeNull();
    expect(loopTypeForInbound({ channel: "maintenance", direction: "internal", is_auto_reply: false, call_answered: null })).toBeNull();
  });
});

describe("closesLoop: email", () => {
  const l = loop({ type: "email", thread_id: "t1" });
  it("closes on an outbound email in the same thread", () => {
    expect(closesLoop(l, interaction({ channel: "email", thread_id: "t1" }))).toBe(true);
  });
  it("does not close on a different thread", () => {
    expect(closesLoop(l, interaction({ channel: "email", thread_id: "t2" }))).toBe(false);
  });
  it("does not close on an auto-reply", () => {
    expect(closesLoop(l, interaction({ channel: "email", thread_id: "t1", is_auto_reply: true }))).toBe(false);
  });
  it("does not close on a call", () => {
    expect(closesLoop(l, interaction({ channel: "call", thread_id: "t1" }))).toBe(false);
  });
  it("does not close an inbound email", () => {
    expect(closesLoop(l, interaction({ channel: "email", thread_id: "t1", direction: "inbound" }))).toBe(false);
  });
  it("never closes a closed loop", () => {
    expect(closesLoop(loop({ type: "email", thread_id: "t1", status: "closed" }), interaction({ channel: "email", thread_id: "t1" }))).toBe(false);
  });
});

describe("closesLoop: missed call", () => {
  const l = loop({ type: "missed_call" });
  it("closes on an answered outbound call", () => {
    expect(closesLoop(l, interaction({ channel: "call", call_answered: true }))).toBe(true);
  });
  it("closes on a voicemail", () => {
    expect(closesLoop(l, interaction({ channel: "call", call_answered: false }))).toBe(true);
  });
  it("does not close on an sms, but marks texted not called", () => {
    const sms = interaction({ channel: "sms" });
    expect(closesLoop(l, sms)).toBe(false);
    expect(marksTextedNotCalled(l, sms)).toBe(true);
    expect(marksTextedNotCalled(loop({ type: "missed_call", texted_not_called: true }), sms)).toBe(false);
    expect(marksTextedNotCalled(loop({ type: "sms" }), sms)).toBe(false);
  });
});

describe("closesLoop: sms", () => {
  const l = loop({ type: "sms" });
  it("closes on an outbound sms or call", () => {
    expect(closesLoop(l, interaction({ channel: "sms" }))).toBe(true);
    expect(closesLoop(l, interaction({ channel: "call" }))).toBe(true);
    expect(closesLoop(l, interaction({ channel: "email" }))).toBe(false);
  });
});

describe("closesLoop: maintenance", () => {
  const description = "Leaking tap in the main bathroom, water pooling under the vanity";
  const l = loop({ type: "maintenance", issue_id: "issue-1" });
  it("closes when the body mentions the issue", () => {
    const i = interaction({ channel: "email", body: "Hi Sarah, the plumber has fixed the leaking tap in the bathroom." });
    expect(closesLoop(l, i, { issueDescription: description })).toBe(true);
  });
  it("closes when metadata names the issue", () => {
    const i = interaction({ channel: "sms", body: "All sorted.", metadata: { issue_id: "issue-1" } });
    expect(closesLoop(l, i, { issueDescription: description })).toBe(true);
  });
  it("does not close on an unrelated email", () => {
    const i = interaction({ channel: "email", body: "Your September statement is attached." });
    expect(closesLoop(l, i, { issueDescription: description })).toBe(false);
  });
  it("does not close on an unrelated issue id", () => {
    const i = interaction({ channel: "sms", body: "All sorted.", metadata: { issue_id: "issue-2" } });
    expect(closesLoop(l, i, { issueDescription: description })).toBe(false);
  });
});

describe("closesLoop: detractor", () => {
  const l = loop({ type: "detractor" });
  it("closes only on a call by a director", () => {
    expect(closesLoop(l, interaction({ channel: "call" }), { staffRole: "director" })).toBe(true);
    expect(closesLoop(l, interaction({ channel: "call" }), { staffRole: "pm" })).toBe(false);
    expect(closesLoop(l, interaction({ channel: "email" }), { staffRole: "director" })).toBe(false);
  });
});

describe("issue keywords", () => {
  it("drops stop words and short words", () => {
    expect(issueKeywords("The dishwasher is not draining")).toEqual(["dishwasher", "draining"]);
  });
  it("matches with a single keyword when that is all there is", () => {
    expect(mentionsIssue({ subject: null, body: "The dishwasher is fixed", ai_summary: null }, null, "Dishwasher")).toBe(true);
  });
});

describe("waitingTitle", () => {
  it("counts business minutes since the loop opened", () => {
    expect(waitingTitle("Sarah Whitfield", bris("2026-09-29T09:00:00"), bris("2026-09-29T10:12:00"))).toBe(
      "Sarah Whitfield has been waiting 1h 12m",
    );
  });
  it("skips the night", () => {
    expect(waitingTitle("Graham Oduya", bris("2026-09-29T17:30:00"), bris("2026-09-30T08:20:00"))).toBe(
      "Graham Oduya has been waiting 50m",
    );
  });
});
