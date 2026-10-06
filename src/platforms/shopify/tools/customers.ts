import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ShopifyClient } from "../client.js";

// P3: tool 名带平台前缀
// ToolMeta: readOnly=true, destructive=false

function ok(data: unknown, rateLimit: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ ...(data as object), _rateLimit: rateLimit }, null, 2),
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

export function registerShopifyCustomerTools(
  server: McpServer,
  client: ShopifyClient
): void {
  // ─── list_shopify_customers ────────────────────────────────
  server.tool(
    "list_shopify_customers",
    "List customers from the Shopify store. Supports pagination and filtering via Shopify query syntax.",
    {
      first: z
        .number()
        .int()
        .positive()
        .default(10)
        .describe("Number of customers to return (max 50)"),
      after: z.string().optional().describe("Pagination cursor for next page"),
      query: z
        .string()
        .optional()
        .describe(
          "Filter using Shopify query syntax, e.g. 'orders_count:>5', 'country:US', 'tag:vip'"
        ),
    },
    async ({ first, after, query }) => {
      try {
        const result = await client.query(
          `query ListCustomers($first: Int!, $after: String, $query: String) {
            customers(first: $first, after: $after, query: $query) {
              edges {
                cursor
                node {
                  id
                  firstName
                  lastName
                  defaultEmailAddress { emailAddress }
                  defaultPhoneNumber { phoneNumber }
                  createdAt
                  updatedAt
                  numberOfOrders
                  amountSpent { amount currencyCode }
                  state
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }`,
          { first: Math.min(first, 50), after, query }
        );
        return ok(result.data, result.rateLimit);
      } catch (error) {
        return fail(error);
      }
    }
  );

  // ─── get_shopify_customer ──────────────────────────────────
  server.tool(
    "get_shopify_customer",
    "Get details of a specific Shopify customer by ID, including their recent orders.",
    {
      customer_id: z
        .string()
        .describe("Shopify customer GID, e.g. 'gid://shopify/Customer/123456'"),
    },
    async ({ customer_id }) => {
      try {
        const result = await client.query(
          `query GetCustomer($id: ID!) {
            customer(id: $id) {
              id
              firstName
              lastName
              defaultEmailAddress { emailAddress }
              defaultPhoneNumber { phoneNumber }
              createdAt
              updatedAt
              numberOfOrders
              amountSpent { amount currencyCode }
              state
              orders(first: 10) {
                edges {
                  node {
                    id
                    name
                    createdAt
                    displayFinancialStatus
                    totalPriceSet {
                      shopMoney { amount currencyCode }
                    }
                  }
                }
              }
            }
          }`,
          { id: customer_id }
        );
        return ok(result.data, result.rateLimit);
      } catch (error) {
        return fail(error);
      }
    }
  );

  // ─── count_shopify_customers ───────────────────────────────
  server.tool(
    "count_shopify_customers",
    "Get the total count of customers in the Shopify store.",
    {
      query: z.string().optional().describe("Filter using Shopify query syntax"),
    },
    async ({ query }) => {
      try {
        const result = await client.query(
          `query CountCustomers($query: String) {
            customersCount(query: $query) {
              count
            }
          }`,
          { query }
        );
        return ok(result.data, result.rateLimit);
      } catch (error) {
        return fail(error);
      }
    }
  );
}
