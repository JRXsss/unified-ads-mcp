/**
 * 跨平台通用接口。
 *
 * Phase 1 只实现最简版本，但接口定义从第一天就到位 —— 等 Phase 2 接入 Shopify 时
 * 验证接口是否好用，不好用再改。
 */

// ── 配置来源抽象 ──
// Phase 1: EnvConfigProvider（从环境变量读）
// 商业化: OAuthConfigProvider（从 OAuth session / DB 读）
export interface ConfigProvider {
  /** 返回 null 表示该平台未配置，调用方应静默跳过（graceful degradation） */
  getConfig(platform: string): PlatformConfig | null;
}

export interface PlatformConfig {
  platform: string; // "meta" | "shopify" | "google" | "tiktok"
  credentials: Record<string, string>;
}

// ── Tool 安全元数据 ──
// 参考 Adspirer 的 readOnlyHint / destructiveHint
// Phase 1: 作为代码注释标记每个 tool 的读写属性
// 商业化: 集成到注册中间件，用于权限控制和审计日志
export interface ToolMeta {
  readOnly: boolean; // Phase 1 全是 true
  destructive: boolean; // Phase 1 全是 false
}

// ── Transport 模式 ──
// Phase 1: stdio only
// 商业化: 加 HTTP/SSE + OAuth（参考 1mcp-app/agent 的 transport factory 模式）
export type TransportMode = "stdio" | "http";

// ── 通用响应格式 ──
// P4: 不做通用 HTTP 抽象（Meta=REST, Shopify=GraphQL），只统一响应的形状。
// 各平台 client 都返回 ApiResponse，tool handler 才能用同一套写法附加 _rateLimit。

export interface RateLimit {
  callCount?: number;
  totalCpuTime?: number;
  totalTime?: number;
}

export interface BusinessRateLimit {
  callCount: number;
  totalCpuTime: number;
  totalTime: number;
  type: string;
  estimatedTimeToRegainAccess?: number;
}

export interface ApiResponse<T = unknown> {
  data: T;
  rateLimit?: RateLimit;
  businessRateLimit?: BusinessRateLimit;
}
