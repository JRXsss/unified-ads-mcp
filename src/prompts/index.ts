import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * MCP prompts —— 预置的多步报表工作流。
 * 引用的都是 Phase 1 已注册的 meta_ 前缀只读 tool。
 */
export function registerPrompts(server: McpServer): void {
  server.prompt(
    "meta_performance_report",
    "Analyze Meta Ads performance with breakdowns and budget recommendations",
    {},
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Generate a comprehensive Meta Ads performance report for my account.",
              "",
              "Gather data with these tools:",
              "1. get_meta_account_insights — overall spend, impressions, clicks, conversions for the last 7 days",
              "2. list_meta_campaigns — get the campaign list (status=ACTIVE)",
              "3. get_meta_campaign_insights — per-campaign performance, breakdowns by age,gender and publisher_platform,platform_position",
              "4. get_meta_adset_insights — ad set metrics to identify the best targeting",
              "5. get_meta_ad_insights — individual ad performance to find top creatives",
              "",
              "Compile a report covering:",
              "- Total spend vs. results (ROAS, CPA, CTR, CPM)",
              "- Top 3 campaigns by ROAS",
              "- Top 3 audiences by CPA",
              "- Top 3 creatives by CTR",
              "- Age/gender breakdown of conversions",
              "- Placement performance comparison (Feed, Stories, Reels, etc.)",
              "- Budget allocation recommendations",
              "- Specific actions to fix underperforming campaigns",
              "",
              "Use date_preset: last_7d for every insights call.",
              "If a query returns a large result set, prefer create_meta_async_report +",
              "get_meta_async_report instead of paging manually.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.prompt(
    "meta_account_health_check",
    "Quick daily check of a Meta ad account — spend, pacing, and delivery status",
    {},
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Run a daily health check on my Meta ad account.",
              "",
              "Steps:",
              "1. get_meta_account_insights with date_preset: today — today's spend, impressions, clicks",
              "2. get_meta_account_insights with date_preset: yesterday — compare against yesterday",
              "3. list_meta_campaigns with status: ACTIVE — what is currently running",
              "4. list_meta_adsets — check for ad sets that are active but have no spend",
              "",
              "Flag anything unusual:",
              "- Spend pacing significantly above or below the daily average",
              "- Active campaigns or ad sets with zero impressions",
              "- CTR or CPM moving sharply versus yesterday",
              "- Any _rateLimit value above 75, which means the app is near its throttle",
              "",
              "Finish with a short summary: what is healthy, what needs attention.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.prompt(
    "meta_campaign_deep_dive",
    "Deep dive into one Meta campaign — structure, delivery, and creative performance",
    {},
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Help me analyze a single Meta campaign in depth. Ask me for the campaign_id first.",
              "",
              "Then:",
              "1. get_meta_campaign_insights — campaign totals for the last 30 days (date_preset: last_30d)",
              "2. list_meta_adsets with that campaign_id — the ad set structure",
              "3. list_meta_ads with the ad set ids — the ads under each ad set",
              "4. get_meta_ad_insights — per-ad performance for the top 3 ad sets",
              "5. get_meta_adset_insights with time_increment: 1 — daily trend for the best ad set",
              "",
              "Report on:",
              "- Delivery: is spend concentrated in one ad set, or spread evenly?",
              "- Creative: which ads carry the campaign, which are dead weight?",
              "- Audience: any ad set with high spend but weak CPA?",
              "- Trend: is performance improving or decaying over the 30-day window?",
              "- Concrete next actions, ranked by expected impact.",
            ].join("\n"),
          },
        },
      ],
    })
  );
}
