import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient } from "./client.js";

function json(uri: string, data: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Meta MCP resources —— 无需 tool 调用即可读取的账户快照。
 * URI 带 /meta/ 段以区分平台（Shopify 将来用 ads://shopify/...）。
 */
export function registerMetaResources(
  server: McpServer,
  client: MetaClient
): void {
  server.resource(
    "meta-account-info",
    "ads://meta/account",
    {
      description:
        "Meta ad account overview — status, balance, currency, timezone, and total spend",
      mimeType: "application/json",
    },
    async () => {
      const { data } = await client.get(client.accountPath(), {
        fields:
          "id,name,account_status,balance,currency,timezone_name,amount_spent,business_name",
      });
      return json("ads://meta/account", data);
    }
  );

  server.resource(
    "meta-campaigns-overview",
    "ads://meta/campaigns",
    {
      description: "All active Meta campaigns with budget information",
      mimeType: "application/json",
    },
    async () => {
      const { data } = await client.get(`${client.accountPath()}/campaigns`, {
        fields: "id,name,status,objective,daily_budget,lifetime_budget",
        effective_status: '["ACTIVE"]',
        limit: "100",
      });
      return json("ads://meta/campaigns", data);
    }
  );

  server.resource(
    "meta-spending-today",
    "ads://meta/spending-today",
    {
      description:
        "Today's Meta spending summary — spend, impressions, clicks, and reach",
      mimeType: "application/json",
    },
    async () => {
      const { data } = await client.get(`${client.accountPath()}/insights`, {
        date_preset: "today",
        fields: "spend,impressions,clicks,reach",
      });
      return json("ads://meta/spending-today", data);
    }
  );
}
