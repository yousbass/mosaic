import { describe, expect, test } from "vitest";
import { MAX_URL, composeLink, mailWebFor } from "./lib/handoff";

const msg = { to: "fatima@alnoor.example", subject: "Re: scope & fee", body: "Hello Fatima,\n\nWednesday works.\n\nBest regards," };

describe("sending through the mail service", () => {
  test("Gmail opens compose in the sender's own Google account", () => {
    // Act
    const { url, bodyInLink } = composeLink("gmail", "me@gmail.com", msg);
    const u = new URL(url);
    // Assert
    expect(u.origin + u.pathname).toBe("https://mail.google.com/mail/u/me%40gmail.com/");
    expect(u.searchParams.get("tf")).toBe("cm");
    expect(u.searchParams.get("to")).toBe(msg.to);
    expect(u.searchParams.get("su")).toBe("Re: scope & fee"); // & is encoded, not a new parameter
    expect(u.searchParams.get("body")).toBe(msg.body);
    expect(bodyInLink).toBe(true);
  });

  test("an account that isn't an address falls back to the first Google account", () => {
    expect(composeLink("gmail", "not an email", msg).url.startsWith("https://mail.google.com/mail/u/0/?")).toBe(true);
    expect(composeLink("gmail", "x@y.com/../../evil", msg).url.startsWith("https://mail.google.com/mail/u/0/?")).toBe(true);
  });

  test("Outlook picks work or personal Outlook from the address", () => {
    expect(composeLink("outlook", "dr@university.example", msg).url.startsWith("https://outlook.office.com/mail/deeplink/compose?")).toBe(true);
    expect(composeLink("outlook", "me@hotmail.com", msg).url.startsWith("https://outlook.live.com/mail/0/deeplink/compose?")).toBe(true);
    expect(new URL(composeLink("outlook", "dr@university.example", msg).url).searchParams.get("subject")).toBe(msg.subject);
  });

  test("Yahoo uses its compose page", () => {
    const u = new URL(composeLink("yahoo", "me@yahoo.com", msg).url);
    expect(u.host).toBe("compose.mail.yahoo.com");
    expect(u.searchParams.get("body")).toBe(msg.body);
  });

  test("a very long message leaves the body out of the link so it can be pasted", () => {
    const long = { ...msg, body: "word ".repeat(3000) };
    const r = composeLink("gmail", "me@gmail.com", long);
    expect(r.bodyInLink).toBe(false);
    expect(r.url.length).toBeLessThanOrEqual(MAX_URL);
    expect(new URL(r.url).searchParams.get("body")).toBeNull();
  });

  test("only mail services hand off", () => {
    expect(mailWebFor("gmail")).toBe("gmail");
    expect(mailWebFor("gdrive")).toBeUndefined();
    expect(mailWebFor(undefined)).toBeUndefined();
  });
});
