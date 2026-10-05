import { describe, expect, test } from "vitest";
import { buildSample } from "./data/sample";
import { demoAccounts, removalCounts, removeAccounts } from "./lib/accounts";
import { makeInverse } from "./store";

const NOW = new Date(2026, 9, 5, 10, 0);

describe("removing accounts", () => {
  test("removing keeps the data unless asked, and frees the cards that showed it", () => {
    // Arrange: the sample has "University email" (a1) on the University page
    const s = buildSample(NOW);
    const mails = s.emails.filter((e) => e.accountId === "a1").length;
    expect(mails).toBeGreaterThan(0);
    // Act
    const next = removeAccounts(s, ["a1"], false);
    // Assert
    expect(next.connections.some((c) => c.id === "a1")).toBe(false);
    expect(next.emails.filter((e) => e.accountId === "a1").length).toBe(mails);
    expect(next.pages.flatMap((p) => p.widgets).some((w) => w.accountId === "a1")).toBe(false);
  });

  test("deleting data takes the account's mail but not other accounts' mail", () => {
    const s = buildSample(NOW);
    const others = s.emails.filter((e) => e.accountId !== "a1").length;
    const next = removeAccounts(s, ["a1"], true);
    expect(next.emails.some((e) => e.accountId === "a1")).toBe(false);
    expect(next.emails.length).toBe(others);
  });

  test("a calendar goes only with the last account of its kind", () => {
    const s = buildSample(NOW);
    // a1 and a2 are both Outlook: removing one keeps Outlook events
    expect(removalCounts(s, ["a1"]).events).toBe(0);
    const both = removalCounts(s, ["a1", "a2"]);
    expect(both.events).toBe(s.events.filter((e) => e.source === "outlook" && !e.createdBy).length);
  });

  test("events you created stay even when their calendar goes", () => {
    const s = buildSample(NOW);
    const mine = { ...s.events[0], id: "mine", source: "outlook" as const, createdBy: "user" as const };
    const next = removeAccounts({ ...s, events: [...s.events, mine] }, ["a1", "a2"], true);
    expect(next.events.some((e) => e.id === "mine")).toBe(true);
  });

  test("Salesforce records go with the Salesforce account", () => {
    const s = buildSample(NOW);
    const c = removalCounts(s, ["a5"]);
    expect(c.deals).toBe(s.deals.length);
    const next = removeAccounts(s, ["a5"], true);
    expect(next.deals).toEqual([]);
    expect(next.tasks.some((k) => k.source === "salesforce")).toBe(false);
    expect(next.tasks.filter((k) => k.source === "mosaic").length).toBe(s.tasks.filter((k) => k.source === "mosaic").length);
  });

  test("drafts keep their text but lose a removed sender", () => {
    const s = buildSample(NOW);
    const d = { id: "d1", to: "x@y.bh", subject: "s", body: "b", jobId: "j1", accountId: "a1", createdBy: "user" as const, status: "draft" as const };
    const next = removeAccounts({ ...s, drafts: [d] }, ["a1"], true);
    expect(next.drafts).toEqual([{ ...d, accountId: undefined }]);
  });

  test("removing every demo account clears their sample data, and Undo brings it all back", () => {
    const s = buildSample(NOW);
    const ids = demoAccounts(s).map((c) => c.id);
    const next = removeAccounts(s, ids, true);
    expect(next.connections).toEqual([]);
    expect(next.emails).toEqual([]);
    expect(next.chats).toEqual([]);
    expect(next.posts).toEqual([]);
    expect(next.files).toEqual([]);
    expect(next.jobs).toEqual(s.jobs); // jobs, pages, notes and your own tasks stay
    expect(next.notes).toEqual(s.notes);
    const undone = makeInverse(s, next)(next);
    expect(undone.connections).toEqual(s.connections);
    expect(undone.emails.length).toBe(s.emails.length);
    expect(undone.pages).toEqual(s.pages);
    expect(undone.events.length).toBe(s.events.length);
  });
});
