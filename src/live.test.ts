import { describe, expect, test } from "vitest";
import { driveKind, driveQuery, driveQuote, driveReadable, freshness, isDenial, isLive, liveErrorCopy, parseDriveFiles, parseFileContent, LIVE } from "./lib/live";
import { suggestLabel, widgetTypeFor } from "./views/ConnectWizard";
import { CONNECTORS, widgetInfo } from "./data/connectors";
import type { Connection } from "./types";

describe("Drive results", () => {
  test("reads the files list and drops entries without an id", () => {
    // Arrange: invented files in the connector's result shape
    const payload = { files: [
      { id: "f1", title: "Course plan", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-01-02T03:04:05Z", viewUrl: "https://drive.google.com/x" },
      { title: "no id" },
      { id: "f2", mimeType: "application/vnd.google-apps.folder", viewUrl: "javascript:alert(1)" },
    ], nextPageToken: "t" };
    // Act
    const files = parseDriveFiles(payload);
    // Assert
    expect(files.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(files[0]).toMatchObject({ title: "Course plan", viewUrl: "https://drive.google.com/x", folder: false });
    expect(files[1]).toMatchObject({ title: "Untitled", folder: true, viewUrl: undefined }); // only https links are kept
  });

  test("returns an empty list for an unexpected shape", () => {
    expect(parseDriveFiles(null)).toEqual([]);
    expect(parseDriveFiles({ files: "nope" })).toEqual([]);
    expect(parseFileContent({ fileContent: 5 })).toBe("");
    expect(parseFileContent({ fileContent: "hello" })).toBe("hello");
  });

  test("quotes search words so a quote can't break the query", () => {
    expect(driveQuote("O'Brien")).toBe("'O\\'Brien'");
    expect(driveQuote("a\\b")).toBe("'a\\\\b'");
    expect(driveQuery("  board   pack ")).toBe("fullText contains 'board' and fullText contains 'pack'");
    expect(driveQuery("")).toBe("");
  });

  test("names file kinds and knows which can be summarised", () => {
    expect(driveKind("application/vnd.google-apps.spreadsheet")).toBe("sheet");
    expect(driveKind("application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe("slides");
    expect(driveKind("application/pdf")).toBe("pdf");
    expect(driveReadable("application/pdf")).toBe(true);
    expect(driveReadable("application/zip")).toBe(false);
    expect(driveReadable("application/vnd.google-apps.folder")).toBe(false);
  });
});

describe("connection failures", () => {
  test("each failure points at the one action that fixes it", () => {
    const fix = (code: string) => liveErrorCopy({ code, message: "x" }, "en", "Google Drive").fix;
    expect(fix("server_not_connected")).toBe("settings");
    expect(fix("needs_reauth")).toBe("settings");
    expect(fix("not_in_manifest")).toBe("permissions");
    expect(fix("server_unavailable")).toBe("retry");
    expect(fix("blocked_by_policy")).toBe("none");
    expect(fix("something_new")).toBe("retry"); // unknown codes read as upstream_error
  });

  test("copy names the connector and has an Arabic version", () => {
    expect(liveErrorCopy({ code: "server_not_connected", message: "" }, "en", "Google Drive").text).toContain("Google Drive");
    expect(liveErrorCopy({ code: "server_not_connected", message: "" }, "ar", "Google Drive").text).toContain("claude.ai");
    expect(liveErrorCopy({ code: "tool_error", message: "File not found" }, "en").text).toContain("File not found");
  });

  test("denials remove data, outages keep it", () => {
    expect(isDenial("needs_reauth")).toBe(true);
    expect(isDenial("not_in_manifest")).toBe(true);
    expect(isDenial("server_unavailable")).toBe(false);
    expect(isDenial("tool_error")).toBe(false);
  });

  test("freshness reads like a person would say it", () => {
    const now = Date.UTC(2026, 0, 1, 12, 0);
    expect(freshness(now - 20_000, "en", now)).toBe("Updated just now");
    expect(freshness(now - 7 * 60_000, "en", now)).toBe("Updated 7 min ago");
    expect(freshness(now - 3 * 3_600_000, "en", now)).toBe("Updated 3 h ago");
    expect(freshness(undefined, "en", now)).toBe("");
  });
});

describe("live accounts", () => {
  const base: Connection = { id: "a", connectorId: "gdrive", label: "Drive", account: "", jobIds: ["j1"], connectedAt: "", demo: false, server: "Google Drive" };

  test("an account is live only when it is not a demo and names its connector", () => {
    expect(isLive(base)).toBe(true);
    expect(isLive({ ...base, demo: true })).toBe(false);
    expect(isLive({ ...base, server: undefined })).toBe(false);
    expect(isLive(undefined)).toBe(false);
  });

  test("every live connector is in the catalogue and its card accepts it", () => {
    for (const [id, spec] of Object.entries(LIVE)) {
      const c = CONNECTORS.find((x) => x.id === id);
      expect(c?.claudeConnector).toBe(spec!.server);
      expect(spec!.tools).toContain(spec!.probe.tool);
      const type = widgetTypeFor(id as Connection["connectorId"]);
      expect(type).toBeDefined();
      expect(widgetInfo(type!).connectors).toContain(id);
    }
  });

  test("Drive accounts get a name like the others", () => {
    expect(suggestLabel("University", "gdrive")).toBe("University Drive");
  });
});
