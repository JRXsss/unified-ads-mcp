# unified-ads-mcp

可扩展的多平台广告数据 MCP server。

- **Phase 1** — Meta Ads 报表（9 tools / 3 resources）
- **Phase 2** — Shopify 订单与客户只读查询（6 tools / 1 resource）
- 架构支持后续接入 Google Ads、TikTok Ads

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
│   ├── meta/
│   │   ├── client.ts           # MetaClient — Graph API v26.0 (REST)
│   │   ├── config.ts           # Meta 专属配置
│   │   ├── resources.ts        # 3 个 MCP resources
│   │   └── tools/
│   │       ├── insights.ts     # 6 个报表 tools
│   │       ├── campaigns.ts    # 3 个列表 tools
│   │       └── index.ts        # registerMetaTools
│   └── shopify/
│       ├── client.ts           # ShopifyClient — Admin GraphQL API 2026-10
│       ├── config.ts           # Shopify 专属配置
│       ├── resources.ts        # 1 个 MCP resource
│       └── tools/
│           ├── orders.ts       # 3 个订单 tools
│           ├── customers.ts    # 3 个客户 tools
│           └── index.ts        # registerShopifyTools
└── prompts/
    └── index.ts                # MCP prompts
```

> Phase 2 同时是对 P1 的验证：新增 Shopify **没有改动 `core/types.ts`，也没有改动
> `platforms/meta/` 下任何文件** —— 只动了 `core/config.ts`（登记环境变量）和
> `src/index.ts`（加一段注册）。

## 环境变量

| Variable | Required | Description |
|---|---|---|
| `META_ADS_ACCESS_TOKEN` | Yes (to enable Meta) | Meta Marketing API access token |
| `META_AD_ACCOUNT_ID` | Yes | 默认 ad account ID |
| `META_APP_ID` | No | 用于 token exchange（Phase 1 未使用） |
| `META_APP_SECRET` | No | 用于 token exchange（Phase 1 未使用） |
| `SHOPIFY_ACCESS_TOKEN` | Yes (to enable Shopify) | Shopify Admin API access token |
| `SHOPIFY_STORE_URL` | Yes | 店铺域名，如 `mystore.myshopify.com`（不含 `https://`） |

每个平台的必填项缺任意一个，该平台整体跳过 —— server 仍能正常启动。两个平台互相独立，
可以只启用其中一个。Shopify token 需要的 scopes：`read_orders`、`read_customers`。

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
    "args": ["/absolute/path/to/unified-ads-mcp/dist/index.js"],
    "env": {
      "META_ADS_ACCESS_TOKEN": "<token>",
      "META_AD_ACCOUNT_ID": "<account_id>",
      "SHOPIFY_ACCESS_TOKEN": "<shopify-admin-api-token>",
      "SHOPIFY_STORE_URL": "<your-store>.myshopify.com",
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

### Shopify 订单（orders.ts）

| Tool | 关键参数 |
|---|---|
| `list_shopify_orders` | first, after, query |
| `get_shopify_order` | order_id（GID，如 `gid://shopify/Order/123`） |
| `count_shopify_orders` | query |

### Shopify 客户（customers.ts）

| Tool | 关键参数 |
|---|---|
| `list_shopify_customers` | first, after, query |
| `get_shopify_customer` | customer_id（GID，如 `gid://shopify/Customer/123`） |
| `count_shopify_customers` | query |

`query` 参数使用 Shopify 查询语法，例如 `financial_status:paid`、
`fulfillment_status:unfulfilled`、`created_at:>2024-01-01`、`tag:vip`。
`first` 上限 50（Shopify 本身允许 250，这里主动收窄以避免 context 过大）。

## Resources

| URI | 说明 |
|---|---|
| `ads://meta/account` | 账户状态、余额、币种、时区 |
| `ads://meta/campaigns` | 所有 ACTIVE campaigns + 预算 |
| `ads://meta/spending-today` | 今日花费汇总 |
| `ads://shopify/shop` | 店铺概览：名称、域名、币种、计划、时区 |

## 网络与代理

**Node 内置的 `fetch` 不读代理环境变量** —— 这是需要额外处理的原因。Claude Code spawn
stdio MCP server 时默认会继承父进程环境，`HTTPS_PROXY` 能传进来，但 Node 拿到它也不会用。
因此 server 启动时会主动检查代理环境变量，如果设置了就用 `undici` 的 `ProxyAgent` 装成
全局 dispatcher —— 各平台 client 无需感知代理。

按此优先级取第一个非空值：`HTTPS_PROXY` → `ALL_PROXY` → `HTTP_PROXY`（大小写都认）。

有三种方式把代理传进来，任选其一：

```jsonc
// 方式 1：写进 ~/.claude.json 的 env（最直接，但明文放在配置文件里）
"env": {
  "META_ADS_ACCESS_TOKEN": "...",
  "META_AD_ACCOUNT_ID": "act_...",
  "HTTPS_PROXY": "http://127.0.0.1:1080"
}
```

```powershell
# 方式 2：设为用户级环境变量（Claude Code 默认继承，配置里无需出现任何密钥）
[Environment]::SetEnvironmentVariable("HTTPS_PROXY", "http://127.0.0.1:1080", "User")
```

方式 3：用 TUN / 全局模式的代理，在网络层转发，程序完全无需感知。

> ⚠️ 不要写 `"HTTPS_PROXY": "${HTTPS_PROXY}"`。变量未设置时 Claude Code 会把字面量
> `${HTTPS_PROXY}` 原样传给子进程并**覆盖**继承到的好值，失败得很隐蔽。

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

**不做自动分页**（两个平台一致）：直接返回原始响应，由调用方按需翻页 —— 自动分页可能
返回大量数据撑爆 context window。

| | Meta | Shopify |
|---|---|---|
| 翻页游标 | `paging.cursors.after` | `pageInfo.endCursor` + `hasNextPage` |
| 限流信息来源 | HTTP header `x-app-usage` | 响应体 `extensions.cost`（cost-based，不是 429） |
| 响应字段 | `_rateLimit`、`_businessRateLimit` | `_rateLimit` |

> Shopify 的 `extensions.cost` 会被映射进统一的 `ApiResponse.rateLimit` 结构
> （`callCount` ← `actualQueryCost`，`totalCpuTime` ← `requestedQueryCost`，
> `totalTime` ← `throttleStatus.currentlyAvailable`）。字段名沿用 Meta 的语义，
> 数值含义以 Shopify cost 为准。

**错误提示分类型**：Meta 按 code 分类（190=Token 过期、17=Rate Limit、100=参数错误、
10=权限不足、2635=账户限额，数值超过 75 说明接近限流）；Shopify 按 HTTP 状态码
（401/402/403/404/429）和 GraphQL `extensions.code`（`ACCESS_DENIED`/`THROTTLED`）。

## 新增一个平台

Phase 2 的 Shopify 就是这个流程的**完整实例**，可对照 `platforms/shopify/` 阅读：

1. 在 `core/config.ts` 的 `PLATFORM_ENV` 登记环境变量（`required` 缺任一即跳过该平台）
2. 新建 `platforms/<name>/`：`client.ts`、`config.ts`、`tools/`、`resources.ts`
3. 在 `src/index.ts` 加一段 `getConfig("<name>")` + 动态 import 注册，并 `enabled.push("<name>")`

**不需要改动 `core/types.ts`，也不需要改动任何已有平台的代码。**

## Out of Scope

写操作、token 管理、多媒体上传、受众管理、OAuth 流程、HTTP/SSE transport、单元测试。

Phase 2 的 Shopify 已落到纯只读查询（订单 / 客户），未实现商品、库存、履约等模块。
