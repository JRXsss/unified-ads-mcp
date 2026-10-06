import { ApiResponse, BusinessRateLimit, RateLimit } from "../../core/types.js";
import { MetaConfig } from "./config.js";

/**
 * API 版本锁定。Meta API 版本约 2 年生命周期，升级时只改这一个常量。
 */
const API_VERSION = "v26.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Meta Marketing API 客户端。
 *
 * P4: 每个平台独立 client，不做通用 HTTP 抽象 —— Meta 是 REST，Shopify 是 GraphQL，
 * 强行统一反而增加复杂度。
 *
 * Phase 1 只做只读查询 + 异步报表创建，因此只暴露 get / post，
 * 不提供 delete()（见方案 §2.3 P5）。同样不移植 postMultipart / upload /
 * exchangeToken / debugToken（见方案 §3.3）。
 */
export class MetaClient {
  private readonly baseUrl = BASE_URL;

  constructor(private readonly config: MetaConfig) {}

  // ── 限流解析 ──────────────────────────────────────────────

  private parseRateLimit(
    headers: Headers
  ): Pick<ApiResponse, "rateLimit" | "businessRateLimit"> {
    const result: Pick<ApiResponse, "rateLimit" | "businessRateLimit"> = {};

    const appUsage = headers.get("x-app-usage");
    if (appUsage) {
      try {
        result.rateLimit = JSON.parse(appUsage) as RateLimit;
      } catch {
        // 忽略解析错误 —— 限流信息缺失不应让请求失败
      }
    }

    const bizUsage = headers.get("x-business-use-case-usage");
    if (bizUsage) {
      try {
        // 结构: { "<business_id>": [{ call_count, total_cputime, total_time, type,
        //                              estimated_time_to_regain_access }] }
        const parsed = JSON.parse(bizUsage) as Record<
          string,
          Array<Record<string, unknown>>
        >;
        const keys = Object.keys(parsed);
        const entries = keys.length > 0 ? parsed[keys[0]] : undefined;
        if (Array.isArray(entries) && entries.length > 0) {
          const e = entries[0];
          result.businessRateLimit = {
            callCount: e.call_count as number,
            totalCpuTime: e.total_cputime as number,
            totalTime: e.total_time as number,
            type: e.type as string,
            estimatedTimeToRegainAccess:
              e.estimated_time_to_regain_access as number | undefined,
          };
        }
      } catch {
        // 同上
      }
    }

    return result;
  }

  // ── 错误信息友好化 ────────────────────────────────────────

  private formatError(errorBody: {
    error?: {
      message?: string;
      code?: number;
      error_subcode?: number;
      error_user_msg?: string;
      error_user_title?: string;
      type?: string;
      fbtrace_id?: string;
    };
  }): string {
    const err = errorBody.error;
    if (!err) return JSON.stringify(errorBody);

    let msg = err.message || "Unknown error";

    if (err.error_user_msg) {
      msg = `${err.error_user_msg} (${msg})`;
    }

    switch (err.code) {
      case 17:
        msg = `[Rate Limit] ${msg}. Wait before retrying — your app or ad account is being throttled.`;
        break;
      case 190:
        msg = `[Token Expired] ${msg}. Replace META_ADS_ACCESS_TOKEN with a fresh long-lived token.`;
        break;
      case 100:
        msg = `[Invalid Parameter] ${msg}. Check the request parameters and field names.`;
        break;
      case 10:
        msg = `[Permission Denied] ${msg}. Ensure the access token has the required permissions (ads_read, ads_management, etc).`;
        break;
      case 2635:
        msg = `[Ad Account Limit] ${msg}. This ad account has reached its spending or creation limit.`;
        break;
    }

    const parts = [`Meta Ads API error: ${msg}`];
    if (err.code !== undefined) parts.push(`code=${err.code}`);
    if (err.error_subcode !== undefined) parts.push(`subcode=${err.error_subcode}`);
    if (err.type) parts.push(`type=${err.type}`);
    if (err.fbtrace_id) parts.push(`trace=${err.fbtrace_id}`);

    return parts.join(" | ");
  }

  // ── 请求核心 ──────────────────────────────────────────────

  private async request(
    method: "GET" | "POST",
    path: string,
    params?: Record<string, unknown>
  ): Promise<ApiResponse> {
    if (!this.config.accessToken) {
      throw new Error(
        "META_ADS_ACCESS_TOKEN is not configured. Set it as an environment variable."
      );
    }

    let url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    };

    if (method === "GET") {
      const qs = new URLSearchParams();
      qs.set("access_token", this.config.accessToken);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== null && v !== "") {
            qs.set(k, String(v));
          }
        }
      }
      url += `?${qs.toString()}`;
    } else {
      const body: Record<string, unknown> = {
        access_token: this.config.accessToken,
        ...params,
      };
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (error) {
      throw new Error(this.describeNetworkError(error));
    }
    return this.handleResponse(res, method, path);
  }

  /**
   * 网络层失败（DNS/连接/超时）时的兜底提示。
   * 裸的 "fetch failed" 无法定位问题，这里补上目标主机和排查方向。
   */
  private describeNetworkError(error: unknown): string {
    const cause =
      error instanceof Error
        ? (error.cause as { code?: string } | undefined)?.code ?? error.message
        : String(error);

    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || cause === "UND_ERR_CONNECT_TIMEOUT");

    if (timedOut) {
      return `[Network Timeout] Meta Graph API (${this.baseUrl}) did not respond within ${REQUEST_TIMEOUT_MS / 1000}s. Check connectivity and try again.`;
    }

    return (
      `[Network] Cannot reach Meta Graph API at ${this.baseUrl} (${cause}). ` +
      `Check your internet connection — if this host is blocked on your network, ` +
      `route it through a proxy or run this MCP server from a host that can reach it.`
    );
  }

  private async handleResponse(
    res: Response,
    method: string,
    path: string
  ): Promise<ApiResponse> {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let errorMsg: string;
      try {
        errorMsg = this.formatError(JSON.parse(text));
      } catch {
        errorMsg = `Meta Ads API ${method} ${path} (${res.status}): ${text}`;
      }
      throw new Error(errorMsg);
    }

    const { rateLimit, businessRateLimit } = this.parseRateLimit(res.headers);
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await res.json();
      // Meta 有时用 200 + body.error 返回错误
      if (data.error) {
        throw new Error(this.formatError(data));
      }
      return { data, rateLimit, businessRateLimit };
    }

    const text = await res.text();
    return { data: text || { success: true }, rateLimit, businessRateLimit };
  }

  // ── 便捷方法 ──────────────────────────────────────────────

  async get(path: string, params?: Record<string, unknown>): Promise<ApiResponse> {
    return this.request("GET", path, params);
  }

  async post(path: string, params?: Record<string, unknown>): Promise<ApiResponse> {
    return this.request("POST", path, params);
  }

  // ── 账户辅助 ──────────────────────────────────────────────

  /**
   * 构造 ad account 路径。accountIdOverride 可覆盖 META_AD_ACCOUNT_ID，
   * 接受 "123" 或 "act_123" 两种写法。
   */
  accountPath(accountIdOverride?: string): string {
    const id = accountIdOverride || this.accountId;
    const normalized = id.startsWith("act_") ? id.slice(4) : id;
    return `/act_${normalized}`;
  }

  get accountId(): string {
    if (!this.config.adAccountId) {
      throw new Error(
        "META_AD_ACCOUNT_ID is not configured. Set it as an environment variable."
      );
    }
    return this.config.adAccountId;
  }
}
