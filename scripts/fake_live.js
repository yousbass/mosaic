// Stand-in for claude.ai's `mcp` and `permissions` capabilities in browser tests.
// Load after fake_ai.js. All files below are invented for the test.
(() => {
  const hours = (h) => new Date(Date.now() - h * 3600_000).toISOString();
  const files = [
    { id: "fileA0000001", title: "ICE 211 course plan", mimeType: "application/vnd.google-apps.document", modifiedTime: hours(2), viewUrl: "https://drive.google.com/file/d/fileA0000001/view", text: "ICE 211 course plan. Midterm in week 7. Lab reports due every Thursday." },
    { id: "fileB0000002", title: "Dilmun proposal draft", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", modifiedTime: hours(20), viewUrl: "https://drive.google.com/file/d/fileB0000002/view", text: "Proposal for Al Noor Logistics. Fee BHD 18,000. Decision needed by 15 October." },
    { id: "fileC0000003", title: "Board pack October", mimeType: "application/pdf", modifiedTime: hours(50), viewUrl: "https://drive.google.com/file/d/fileC0000003/view", text: "Board pack. Agenda: budget, audit committee, CEO update." },
    { id: "fileD0000004", title: "Studio price list", mimeType: "application/vnd.google-apps.spreadsheet", modifiedTime: hours(80), viewUrl: "https://drive.google.com/file/d/fileD0000004/view", text: "Portrait session BHD 45. Family session BHD 70." },
    { id: "fileE0000005", title: "Accreditation", mimeType: "application/vnd.google-apps.folder", modifiedTime: hours(120), viewUrl: "https://drive.google.com/drive/folders/fileE0000005" },
  ];
  window.__mcpCalls = [];
  const mode = () => window.__mcpMode || "ok";
  const pub = (f) => { const { text, ...rest } = f; return rest; };
  const run = async (server, tool, input) => {
    window.__mcpCalls.push({ server, tool, input });
    await new Promise((r) => setTimeout(r, 30));
    if (server !== "Google Drive") throw { code: "server_not_connected", server, message: "" };
    if (mode() === "not_connected") throw { code: "server_not_connected", server, message: "" };
    if (mode() === "declined") throw { code: "not_in_manifest", server, message: "" };
    if (mode() === "down") throw { code: "server_unavailable", server, message: "timeout", retryable: true, retryAfterMs: 10 };
    if (tool === "list_recent_files") return { content: [], payload: { files: files.slice(0, input.pageSize || 10).map(pub), nextPageToken: "next" } };
    if (tool === "search_files") {
      const words = [...String(input.query).matchAll(/contains '((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].toLowerCase());
      return { content: [], payload: { files: files.filter((f) => words.every((w) => (f.title + " " + (f.text || "")).toLowerCase().includes(w))).map(pub) } };
    }
    if (tool === "read_file_content") {
      const f = files.find((x) => x.id === input.fileId);
      if (!f || !f.text) throw { code: "tool_error", server, message: "File not found" };
      return { content: [], payload: { fileContent: f.text, title: f.title, viewUrl: f.viewUrl } };
    }
    throw { code: "not_in_manifest", server, message: "" };
  };
  const watchers = new Set();
  const deliver = async (w) => {
    try { const result = await run(w.s, w.t, w.i); if (watchers.has(w)) w.h({ type: "data", result }); }
    catch (e) { if (watchers.has(w)) w.h({ type: "error", error: e }); }
  };
  const mcp = Object.freeze({
    callTool: (s, t, i) => run(s, t, i),
    watchTool: (s, t, i, h) => { const w = { s, t, i, h }; watchers.add(w); queueMicrotask(() => deliver(w)); return () => watchers.delete(w); },
    invalidate: async (s, t) => { for (const w of [...watchers]) if ((!s || w.s === s) && (!t || w.t === t)) void deliver(w); },
    listTools: async () => ({ servers: mode() === "not_connected" ? [] : [{ server: "Google Drive", authStatus: "connected", tools: [{ name: "list_recent_files" }, { name: "search_files" }, { name: "read_file_content" }] }] }),
  });
  window.__watchError = (code) => { for (const w of watchers) w.h({ type: "error", error: { code, server: w.s, message: "" } }); };
  window.__watchCount = () => watchers.size;

  const prev = window.claude.use;
  let wrapped;
  const getSample = async () => {
    if (wrapped) return wrapped;
    const base = await prev("sample");
    wrapped = async (input, opts = {}) => {
      const last = Array.isArray(input) ? input[input.length - 1].content : String(input);
      const ctx = { signal: new AbortController().signal };
      if (opts.tools && /drive/i.test(last)) {
        window.__liveToolNames = opts.tools.map((t) => t.name);
        const found = await opts.tools.find((t) => t.name === "search_drive").execute({ words: "proposal" }, ctx);
        const r = await opts.tools.find((t) => t.name === "read_drive_file").execute({ file_id: found[0].id }, ctx);
        let bad = null; try { await opts.tools.find((t) => t.name === "read_drive_file").execute({ file_id: "../x" }, ctx); } catch (e) { bad = String(e.message); }
        window.__badId = bad;
        const text = `**${r.title}** asks for a decision by **15 October**. The fee is BHD 18,000.`;
        opts.onText && opts.onText({ text, delta: text });
        return { text, truncated: false, modelTierApplied: "default" };
      }
      if (!opts.tools && /Summarize this file/.test(last)) {
        window.__summaryPrompt = last;
        const text = "- Course plan for ICE 211\n- Midterm in **week 7**\n- Lab reports due Thursdays";
        opts.onText && opts.onText({ text, delta: text });
        return { text, truncated: false, modelTierApplied: "quick" };
      }
      return base(input, opts);
    };
    wrapped.json = base.json; wrapped.limits = base.limits;
    return wrapped;
  };
  window.claude = {
    use: async (name) => {
      if (name === "mcp") return mode() === "none" ? null : mcp;
      if (name === "permissions") return { manage: async () => { window.__permOpened = true; }, state: async () => "granted", request: async () => ({}) };
      if (name === "sample") return getSample();
      return prev(name);
    },
  };
})();
