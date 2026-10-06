import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient } from "../client.js";

// P3: tool 名带平台前缀
// ToolMeta: readOnly=true, destructive=false（P5: Phase 1 只做只读查询）

const accountIdOverride = z
  .string()
  .optional()
  .describe(
    "Ad account ID to query (e.g. 'act_123' or '123'). Falls back to META_AD_ACCOUNT_ID env var if omitted."
  );

const statusFilter = z
  .string()
  .optional()
  .describe("Filter by status: ACTIVE, PAUSED, DELETED, ARCHIVED");

function ok(data: unknown, rateLimit: unknown, businessRateLimit?: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            ...(data as object),
            _rateLimit: rateLimit,
            ...(businessRateLimit !== undefined
              ? { _businessRateLimit: businessRateLimit }
              : {}),
          },
          null,
          2
        ),
      },
    ],
  };
}

function fail(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    ],
    isError: true,
  };
}

export function registerMetaListTools(
  server: McpServer,
  client: MetaClient
): void {
  // ─── list_meta_campaigns ───────────────────────────────────
  server.tool(
    "list_meta_campaigns",
    "List campaigns in the Meta ad account. Supports filtering by status and objective. Returns paginated results.",
    {
      status: statusFilter,
      objective: z
        .string()
        .optional()
        .describe(
          "Filter by objective: OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT, OUTCOME_LEADS, OUTCOME_SALES, OUTCOME_TRAFFIC, OUTCOME_APP_PROMOTION"
        ),
      fields: z.string().optional().describe("Comma-separated fields to return"),
      limit: z.number().optional().default(25).describe("Number of results (default 25)"),
      after: z.string().optional().describe("Pagination cursor for next page"),
      account_id: accountIdOverride,
    },
    async ({ status, objective, fields, limit, after, account_id }) => {
      try {
        const params: Record<string, unknown> = {};
        if (fields) params.fields = fields;
        if (limit) params.limit = limit;
        if (after) params.after = after;
        if (status) params.effective_status = `["${status}"]`;
        if (objective) params.objective = objective;

        const { data, rateLimit, businessRateLimit } = await client.get(
          `${client.accountPath(account_id)}/campaigns`,
          params
        );
        return ok(data, rateLimit, businessRateLimit);
      } catch (error) {
        return fail(error);
      }
    }
  );

  // ─── list_meta_adsets ──────────────────────────────────────
  server.tool(
    "list_meta_adsets",
    "List ad sets in the Meta ad account. Optionally filter by campaign or status.",
    {
      campaign_id: z.string().optional().describe("Filter by campaign ID"),
      status: statusFilter,
      fields: z.string().optional().describe("Comma-separated fields to return"),
      limit: z.number().optional().default(25).describe("Number of results (default 25)"),
      after: z.string().optional().describe("Pagination cursor for next page"),
      account_id: accountIdOverride,
    },
    async ({ campaign_id, status, fields, limit, after, account_id }) => {
      try {
        const params: Record<string, unknown> = {};
        if (fields) params.fields = fields;
        if (limit) params.limit = limit;
        if (after) params.after = after;
        if (campaign_id) params.campaign_id = campaign_id;
        if (status) params.effective_status = `["${status}"]`;

        const { data, rateLimit, businessRateLimit } = await client.get(
          `${client.accountPath(account_id)}/adsets`,
          params
        );
        return ok(data, rateLimit, businessRateLimit);
      } catch (error) {
        return fail(error);
      }
    }
  );

  // ─── list_meta_ads ─────────────────────────────────────────
  server.tool(
    "list_meta_ads",
    "List ads in the Meta ad account. Optionally filter by ad set or status.",
    {
      adset_id: z.string().optional().describe("Filter by ad set ID"),
      status: statusFilter,
      fields: z.string().optional().describe("Comma-separated fields to return"),
      limit: z.number().optional().default(25).describe("Number of results (default 25)"),
      after: z.string().optional().describe("Pagination cursor for next page"),
      account_id: accountIdOverride,
    },
    async ({ adset_id, status, fields, limit, after, account_id }) => {
      try {
        const params: Record<string, unknown> = {};
        if (fields) params.fields = fields;
        if (limit) params.limit = limit;
        if (after) params.after = after;
        if (adset_id) params.adset_id = adset_id;
        if (status) params.effective_status = `["${status}"]`;

        const { data, rateLimit, businessRateLimit } = await client.get(
          `${client.accountPath(account_id)}/ads`,
          params
        );
        return ok(data, rateLimit, businessRateLimit);
      } catch (error) {
        return fail(error);
      }
    }
  );
}
