# unified-ads-mcp

可扩展的多平台广告数据 MCP server。Phase 1 接入 **Meta Ads** 报表功能，架构支持后续接入
Shopify、Google Ads、TikTok Ads。

## 设计原则

| 原则 | 说明 |
|---|---|
| **P1 平台隔离** | 每个平台一个独立目录（client + config + tools），平台之间零耦合 |
| **P2 按配置启用** | 环境变量齐全才注册该平台，缺凭证静默跳过，不报错 |
| **P3 Tool 名前缀** | `get_meta_account_insights` 而非 `get_account_insights`，避免多平台冲突 |
| **P4 独立 client** | 不做通用 HTTP 抽象 —— Meta 是 REST，Shopify 是 GraphQL |
| **P5 报告优先** | Phase 1 只做只读查询，不做 create/update/delete |

## 目录结构

```
src/
├── index.ts                    # 入口：创建 McpServer，按配置注册各平台
├── core/
│   ├── types.ts                # 跨平台通用接口（ConfigProvider, ToolMeta 等）
│   └── config.ts               # EnvConfigProvider
├── platforms/
│   └── meta/
│       ├── client.ts           # MetaClient — Graph API v26.0 HTTP 封装
│       ├── config.ts           # Meta 专属配置
│       ├── resources.ts        # 3 个 MCP resources
│       └── tools/
│           ├── insights.ts     # 6 个报表 tools
│           ├── campaigns.ts    # 3 个列表 tools
│           └── index.ts        # registerMetaTools
└── prompts/
    └── index.ts                # MCP prompts
```

## 环境变量

| Variable | Required | Description |
|---|---|---|
| `META_ADS_ACCESS_TOKEN` | Yes (to enable Meta) | Meta Marketing API access token |
| `META_AD_ACCOUNT_ID` | Yes | 默认 ad account ID |
| `META_APP_ID` | No | 用于 token exchange（Phase 1 未使用） |
| `META_APP_SECRET` | No | 用于 token exchange（Phase 1 未使用） |

两个必填项缺任意一个，Meta 平台整体跳过 —— server 仍能正常启动。

## 构建与运行

```bash
npm install
npm run build      # tsc → dist/
npm run dev        # tsx 直接跑 src/index.ts
npm run lint       # tsc --noEmit
```

## 配置到 Claude Code

在 `~/.claude.json` 的 `mcpServers` 中加入：

```json
{
  "unified-ads-mcp": {
    "command": "node",
    "args": ["D:/Users/Roxy/Projects/unified-ads-mcp/dist/index.js"],
    "env": {
      "META_ADS_ACCESS_TOKEN": "<token>",
      "META_AD_ACCOUNT_ID": "<account_id>",
      "HTTPS_PROXY": "http://127.0.0.1:1080"
    }
  }
}
```

## Tools

### 报表（insights.ts）

| Tool | 说明 |
|---|---|
| `get_meta_account_insights` | 账户级报表 |
| `get_meta_campaign_insights` | Campaign 级报表 |
| `get_meta_adset_insights` | Ad Set 级报表 |
| `get_meta_ad_insights` | Ad 级报表 |
| `create_meta_async_report` | 创建异步报表（大数据量） |
| `get_meta_async_report` | 查询异步报表状态 / 结果 |

公共参数：`fields`、`breakdowns`、`date_preset`、`time_range`、`time_increment`、
`filtering`、`level`。

### 列表（campaigns.ts）

| Tool | 关键参数 |
|---|---|
| `list_meta_campaigns` | status, objective, fields, limit, after |
| `list_meta_adsets` | campaign_id, status, fields, limit, after |
| `list_meta_ads` | adset_id, status, fields, limit, after |

所有 account 级 tool 都接受可选的 `account_id` 覆盖 `META_AD_ACCOUNT_ID`。

## Resources

| URI | 说明 |
|---|---|
| `ads://meta/account` | 账户状态、余额、币种、时区 |
| `ads://meta/campaigns` | 所有 ACTIVE campaigns + 预算 |
| `ads://meta/spending-today` | 今日花费汇总 |

## 网络与代理

MCP server 由 Claude Code 直接 spawn，**不继承终端里的 `HTTPS_PROXY`**，而 Node 20 内置的
`fetch` 本身也不读代理环境变量。因此 server 启动时会主动检查代理环境变量，如果设置了就
用 `undici` 的 `ProxyAgent` 装成全局 dispatcher —— 各平台 client 无需感知代理。

按此优先级取第一个非空值：`HTTPS_PROXY` → `ALL_PROXY` → `HTTP_PROXY`（大小写都认）。

```jsonc
// ~/.claude.json 里必须显式传，否则拿不到终端里的代理
"env": {
  "META_ADS_ACCESS_TOKEN": "...",
  "META_AD_ACCOUNT_ID": "act_...",
  "HTTPS_PROXY": "http://127.0.0.1:1080"
}
```

不设代理环境变量则直连（适合部署在能直连 Meta 的海外主机上）。

启动时 stderr 会打印实际生效的代理，便于排查：

```
[unified-ads-mcp] v0.1.0 — enabled platforms: meta — proxy: http://127.0.0.1:1080
```

已知限制：**不处理 `NO_PROXY`**。本 server 只访问固定的几个广告平台 API，需要直连时
不设代理环境变量即可。

网络层失败（DNS / 连接 / 超时）会被转成可定位的错误，而不是裸的 `fetch failed`：

```
Failed: [Network Timeout] Meta Graph API (https://graph.facebook.com/v26.0) did not respond within 30s.
```

## 分页与限流

- **不做自动分页**：直接返回 Meta 原始响应，含 `paging.cursors.after`，由调用方按需翻页。
  自动分页可能返回大量数据撑爆 context window。
- **每个响应附带 `_rateLimit`**（来自 `x-app-usage` header），另有 `_businessRateLimit`
  （来自 `x-business-use-case-usage`）。数值超过 75 说明接近限流。
- **错误提示分类型**：code 190=Token 过期、17=Rate Limit、100=参数错误、10=权限不足、
  2635=账户限额。

## 新增一个平台

以 Shopify 为例，**不需要改动 `core/` 或任何 Meta 代码**：

1. 在 `core/config.ts` 的 `PLATFORM_ENV` 登记环境变量
2. 新建 `platforms/shopify/`：`client.ts`、`config.ts`、`tools/`、`resources.ts`
3. 在 `src/index.ts` 加一段 `getConfig("shopify")` + 动态 import 注册

## Out of Scope（Phase 1）

写操作、token 管理、多媒体上传、受众管理、OAuth 流程、HTTP/SSE transport、单元测试。
