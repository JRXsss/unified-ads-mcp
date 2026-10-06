import { ApiResponse } from "../../core/types.js";
import { ShopifyConfig } from "./config.js";

const API_VERSION = "2026-10";
const REQUEST_TIMEOUT_MS = 30_000;
/** 剩余寿命不足这个时间就主动换新 token */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Shopify Admin GraphQL API 客户端。
 *
 * P4: 每个平台独立 client。Shopify 是 GraphQL，Meta 是 REST，
 * 各自实现，不强行统一。
 *
 * ── 关于 token 生命周期 ──
 * Dev Dashboard 类型的 app 不在后台展示 access token，只能用
 * client_credentials 换取，且**有效期仅 24 小时**。因此当配置里提供了
 * SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET 时，本 client 会自行续期：
 *   - 每次请求前检查剩余寿命，不足 5 分钟就先换
 *   - 收到 401 时换一次并重试（覆盖 token 被吊销的情况，例如 app 重装）
 * 未提供 client 凭证时退化为原行为：只用 SHOPIFY_ACCESS_TOKEN。
 *
 * 注意：Shopify 后台那个 6 个月有效期的 "App automation token"（atkn_ 前缀）
 * 不能用于 Admin API —— 实测返回 401 "Service is not valid for authentication"。
 */
export class ShopifyClient {
  private readonly endpoint: string;
  private readonly tokenEndpoint: string;
  private readonly config: ShopifyConfig;

  /** 运行时 token；可能被续期替换，因此不用 this.config.accessToken */
  private currentToken: string;
  /** 过期时刻（epoch ms）。0 = 寿命未知，不主动续期 */
  private tokenExpiresAt = 0;
  /** 并发去重：多个请求同时触发续期时只发一次换取请求 */
  private refreshInFlight: Promise<void> | null = null;

  constructor(config: ShopifyConfig) {
    this.config = config;
    // 标准化 store URL：去掉可能带的 https:// 和尾部 /
    const cleanUrl = config.storeUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    this.endpoint = `https://${cleanUrl}/admin/api/${API_VERSION}/graphql.json`;
    this.tokenEndpoint = `https://${cleanUrl}/admin/oauth/access_token`;
    this.currentToken = config.accessToken;
  }

  // ── token 续期 ────────────────────────────────────────────

  private get canRefresh(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret);
  }

  private async ensureFreshToken(): Promise<void> {
    if (!this.canRefresh) return;
    if (this.tokenExpiresAt === 0) return; // 寿命未知（首次），交给 401 重试兜底
    if (Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_MARGIN_MS) return;
    await this.refreshToken();
  }

  /** 用 client_credentials 换取新 token */
  private async refreshToken(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      try {
        let res: Response;
        try {
          res = await fetch(this.tokenEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: this.config.clientId,
              client_secret: this.config.clientSecret,
              grant_type: "client_credentials",
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
        } catch (error) {
          throw new Error(this.describeNetworkError(error, "token endpoint"));
        }

        const text = await res.text().catch(() => "");
        if (!res.ok) {
          throw new Error(
            `[Token Refresh] Shopify token endpoint returned ${res.status}: ${text.slice(0, 200)}`
          );
        }

        let json: { access_token?: string; expires_in?: number };
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error(
            `[Token Refresh] token endpoint returned non-JSON: ${text.slice(0, 200)}`
          );
        }

        if (!json.access_token) {
          throw new Error("[Token Refresh] response missing access_token");
        }

        this.currentToken = json.access_token;
        this.tokenExpiresAt = json.expires_in
          ? Date.now() + json.expires_in * 1000
          : 0;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  // ── GraphQL 请求 ──────────────────────────────────────────

  private async post(gql: string, variables?: Record<string, unknown>): Promise<Response> {
    try {
      return await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.currentToken,
        },
        body: JSON.stringify({ query: gql, variables: variables ?? {} }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(this.describeNetworkError(error, "API"));
    }
  }

  /**
   * 执行 GraphQL 查询。
   *
   * Shopify rate limit 通过响应体中的 extensions.cost 返回，
   * 不在 HTTP header 中。我们把它放到 ApiResponse.rateLimit 位置
   * 以保持和 Meta client 一致的响应结构。
   */
  async query<T = unknown>(
    gql: string,
    variables?: Record<string, unknown>
  ): Promise<ApiResponse<T>> {
    if (!this.currentToken && !this.canRefresh) {
      throw new Error(
        "SHOPIFY_ACCESS_TOKEN is not configured, and no client credentials are available for refresh."
      );
    }

    await this.ensureFreshToken();

    let res = await this.post(gql, variables);

    // token 可能在两次刷新之间失效 —— 例如 app 被重装会吊销所有已发出的 token
    if (res.status === 401 && this.canRefresh) {
      await this.refreshToken();
      res = await this.post(gql, variables);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(this.formatHttpError(res.status, text));
    }

    const json = (await res.json()) as {
      data?: T;
      errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
      extensions?: {
        cost?: {
          requestedQueryCost: number;
          actualQueryCost: number;
          throttleStatus: {
            maximumAvailable: number;
            currentlyAvailable: number;
            restoreRate: number;
          };
        };
      };
    };

    // GraphQL 错误（HTTP 200 但 body 有 errors）
    if (json.errors && json.errors.length > 0) {
      const messages = json.errors.map((e) => e.message).join("; ");
      const firstCode = json.errors[0]?.extensions?.code;
      let hint = "";
      if (firstCode === "ACCESS_DENIED") {
        hint =
          " Ensure the access token has required scopes (read_orders, read_customers).";
      } else if (firstCode === "THROTTLED") {
        hint = " Query cost exceeded. Wait and retry with smaller page size.";
      }
      throw new Error(`Shopify GraphQL error: ${messages}${hint}`);
    }

    if (!json.data) {
      throw new Error("Shopify GraphQL response missing data field.");
    }

    // 将 Shopify 的 cost-based rate limit 转为统一格式
    const cost = json.extensions?.cost;
    const rateLimit = cost
      ? {
          callCount: cost.actualQueryCost,
          totalCpuTime: cost.requestedQueryCost,
          totalTime: cost.throttleStatus.currentlyAvailable,
        }
      : undefined;

    return { data: json.data, rateLimit };
  }

  // ── 错误信息 ──────────────────────────────────────────────

  private formatHttpError(status: number, body: string): string {
    switch (status) {
      case 401:
        return `[Unauthorized] Shopify API returned 401. Check SHOPIFY_ACCESS_TOKEN is valid${
          this.canRefresh
            ? ", or the configured client credentials (SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET)"
            : " (no client credentials configured, so automatic refresh is unavailable)"
        }.`;
      case 402:
        return `[Payment Required] Shopify API returned 402. Store may be frozen or on an expired trial.`;
      case 403:
        return `[Forbidden] Shopify API returned 403. The app may lack required API scopes.`;
      case 404:
        return `[Not Found] Shopify API returned 404. Check SHOPIFY_STORE_URL is correct (${this.endpoint}).`;
      case 429:
        return `[Rate Limit] Shopify API returned 429. Wait before retrying.`;
      default:
        return `Shopify API error (${status}): ${body.slice(0, 500)}`;
    }
  }

  private describeNetworkError(error: unknown, what: string): string {
    const cause =
      error instanceof Error
        ? (error.cause as { code?: string } | undefined)?.code ?? error.message
        : String(error);

    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || cause === "UND_ERR_CONNECT_TIMEOUT");

    if (timedOut) {
      return `[Network Timeout] Shopify ${what} (${this.endpoint}) did not respond within ${REQUEST_TIMEOUT_MS / 1000}s.`;
    }

    return `[Network] Cannot reach Shopify ${what} at ${this.endpoint} (${cause}). Check your internet connection.`;
  }

  get storeUrl(): string {
    return this.config.storeUrl;
  }
}
