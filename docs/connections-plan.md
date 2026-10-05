# Making Mosaic's connections real

Mosaic is a single page on claude.ai, and that page can't call other websites. It can call the viewer's **claude.ai connectors** through the artifact `mcp` capability, signed in as the viewer. So every live connection goes through a connector:

- a ready-made one from the claude.ai directory, or
- **Mosaic Bridge**: our own small server, which you add to claude.ai as a custom connector.

Rule for every step: Mosaic wires a connector only after its real tool definitions are visible in a session, and checks one safe read call. Nothing is guessed.

## Order and status

| # | App | Route | What the user does | Status |
|---|---|---|---|---|
| 0 | Google Drive | claude.ai connector (read) | Already connected | **Live** (v3) |
| 1 | Gmail | Connector reads the inbox. Send opens Gmail's compose window, pre-filled, in the chosen account | Sign in to Gmail on claude.ai and switch it on for the chat | **Sending live** (v4, also for Outlook and Yahoo accounts). Reading: waiting for sign-in |
| 2 | Google Calendar | Connector reads events. Booking opens Google Calendar pre-filled, or downloads an `.ics` file | Sign in | Planned |
| 3 | Outlook, Teams, OneDrive | Microsoft 365 connector. Reads mail, calendar, chats and files. Can send and book if the organisation's admin turns on write actions | Work or school account, plus one-time tenant consent from a Microsoft Entra Global Administrator | Planned |
| 4 | Salesforce | Salesforce connector (`describe`, `discover`, `dispatch_readonly`, `dispatch`) | Sign in | Planned |
| 5 | Slack | Slack connector (search, read, send) | Sign in | Planned |
| 6 | Zoom | Connector reads past meetings, recordings, summaries and chat. It can't create meetings | Sign in | Planned |
| 7 | Mosaic Bridge | Our own remote MCP server on Cloudflare Workers, added in claude.ai under Customize → Connectors → Add custom connector, protected by OAuth | Free Cloudflare account. Developer apps per service, below | Planned |
| 7a | Yahoo Mail | Bridge reads mail over IMAP and sends over SMTP, using a Yahoo **app password** stored as an encrypted secret. Yahoo's OAuth mail access needs a commercial agreement | Create a Yahoo app password | Planned |
| 7b | LinkedIn | Bridge posts with the Posts API (`w_member_social`). The API can't schedule, so the bridge schedules. Reading the feed is restricted | LinkedIn developer app | Planned |
| 7c | Instagram | Bridge publishes with Instagram API with Instagram Login (`instagram_business_content_publish`). Professional account only. Media must be at a public URL. Limit: 100 posts per 24 h | Meta developer app, professional account | Planned |
| 7d | Tender Board | Bridge reads the public e-tendering dashboard each day and matches your keywords, if the site's terms allow it | None | Planned |
| 7e | Zoom meetings | Bridge creates meetings with a Zoom OAuth app (`meeting:write`) | Zoom developer app | Planned |

## Sources

- Custom connectors (remote MCP): https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- Gmail connector: https://claude.com/docs/connectors/google/gmail
- Google Calendar connector: https://claude.com/docs/connectors/google/calendar
- Microsoft 365 connector: https://claude.com/docs/connectors/microsoft/365
- Zoom for Claude: https://developers.zoom.us/docs/mcp/plug-ins-and-connectors/claude-connector/
- Yahoo access (OAuth approval vs app passwords): https://developer.nylas.com/docs/dev-guide/provider-guides/yahoo-authentication/
- LinkedIn Posts API: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
- Instagram content publishing: https://developers.facebook.com/docs/instagram-platform/content-publishing/
