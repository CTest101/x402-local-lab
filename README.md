# x402-local-lab

x402 协议本地测试环境。TypeScript monorepo，包含 EVM（Base Sepolia）和 SVM（Solana Devnet）双链支付 + SIWX 身份认证。

## 项目结构

```
apps/
  x402-server/    Express server，x402 paywall + SIWX middleware
  x402-client/    fetch client，自动 402→签名→重试
packages/
  config/         env schema 校验（zod）
  signer/         签名抽象接口
  types/          共享类型
  payment-core/   支付辅助（预留）
docs/
  reports/        运行报告（JSON + Markdown）
```

## 环境要求

- Node.js >= 22
- pnpm >= 9

## Server 启动

### 1. 安装依赖

```bash
git clone https://github.com/CoboTest/x402-local-lab.git
cd x402-local-lab
pnpm install
```

### 2. 配置 `.env`

```bash
cp .env.example .env
```

编辑 `.env`，填入你的地址：

```env
# === Server Config (required) ===
X402_NETWORK=eip155:84532
X402_FACILITATOR_URL=https://www.x402.org/facilitator
X402_SELLER_PAYTO=0xYOUR_BASE_SEPOLIA_ADDRESS
X402_PRICE_USD=0.001
RPC_URL=https://sepolia.base.org
X402_SVM_NETWORK=solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1
X402_SVM_SELLER_PAYTO=YOUR_SOLANA_DEVNET_ADDRESS
```

> ⚠️ Facilitator URL 必须带 `www.`（`https://www.x402.org/facilitator`），不带会 308 重定向导致静默失败。

### 3. 启动

```bash
pnpm --filter @x402-local/server run dev
```

Server 默认监听 `127.0.0.1:4020`。设置 `HOST=0.0.0.0` 可开启公网访问。

### 4. 验证

```bash
# 健康检查
curl http://localhost:4020/health

# 单次付费路由（402）
curl http://localhost:4020/premium/evm

# SIWX 路由（402 + SIWX extension）
curl http://localhost:4020/siwx/evm

# 自定义价格
curl "http://localhost:4020/premium/evm?amount=0.01"
```

## Server 端点

### Pay-per-request（单次付费，无 SIWX）

| 路径 | 说明 |
|------|------|
| `GET /premium/evm` | EVM 单次付费（Base Sepolia USDC） |
| `GET /premium/svm` | SVM 单次付费（Solana Devnet USDC） |
| `GET /premium/multi` | 多链单次付费（EVM 或 SVM 均可） |

每次请求都需要支付，不记录钱包身份。

### SIWX（付一次 + 钱包签名复访）

| 路径 | 说明 |
|------|------|
| `GET /siwx/evm` | EVM 付费 + SIWX 复访 |
| `GET /siwx/svm` | SVM 付费 + SIWX 复访 |
| `GET /siwx/multi` | 多链付费 + SIWX 复访 |
| `GET /siwx/profile` | Auth-only：只需钱包签名，不需要付费 |

首次需要支付，之后同一钱包发送 `SIGN-IN-WITH-X` header 即可免费访问。

### 工具端点

| 路径 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `GET /debug/siwx` | 查看已付费钱包地址（调试用） |

### Query 参数

- `?amount=<USD>` — 动态设置价格（如 `?amount=0.01` = 0.01 USDC）

### Response 增强

- **402 Response**：Body 包含支付信息 + `paymentRequired` 字段（PAYMENT-REQUIRED header 的 JSON 解码）
- **200 Response**：Body 包含业务数据 + `settlement` 字段（txHash、payer、network）

## SIWX 标准流程

```
Client                           Server                          Facilitator
  │                                │                                │
  │── GET /siwx/evm ──────────────►│                                │
  │◄── 402 + PAYMENT-REQUIRED ─────│                                │
  │    {                           │                                │
  │      accepts: [...],           │                                │
  │      extensions: {             │                                │
  │        "sign-in-with-x": {     │                                │
  │          info: { nonce, ... }, │                                │
  │          supportedChains: [...] │                                │
  │        }                       │                                │
  │      }                         │                                │
  │    }                           │                                │
  │                                │                                │
  │  [首次：构造支付签名]            │                                │
  │── GET + PAYMENT-SIGNATURE ────►│── verify ─────────────────────►│
  │                                │◄── isValid=true ──────────────│
  │                                │── settle ────────────────────►│
  │                                │◄── txHash ───────────────────│
  │                                │  [settle hook 记录钱包地址]     │
  │◄── 200 + settlement ──────────│                                │
  │                                │                                │
  │  [后续：构造 SIWX 签名]         │                                │
  │── GET + SIGN-IN-WITH-X ──────►│                                │
  │                                │  [验签 → 查付费记录 → 放行]      │
  │◄── 200（免付费）──────────────│                                │
```

### SIWX 注意事项

- **EVM 地址必须使用 EIP-55 checksum 格式**（如 `0x16c4dCE25...`），全小写会导致验签失败
- **SVM 签名使用 Base58 编码**，不是 hex 格式
- **InMemorySIWxStorage**：server 重启后付费记录清空。生产环境应使用持久化存储
- **标准流程**：不涉及 JWT，每次请求带 `SIGN-IN-WITH-X` header，server 直接验签

## Client 启动

### 1. 配置 `.env`（补充 client 字段）

```env
# EVM client
BUYER_PRIVATE_KEY=0xYOUR_TEST_PRIVATE_KEY
RESOURCE_SERVER_URL=http://localhost:4020/premium/evm

# SVM client（可选）
SOLANA_PRIVATE_KEY=YOUR_SOLANA_BASE58_SECRET_KEY
SVM_RESOURCE_URL=http://localhost:4020/premium/svm
```

> ⚠️ 私钥仅用于测试网。确保 Base Sepolia 账户有 ETH（gas）和 USDC，Solana Devnet 账户有 USDC。

### 2. 获取测试代币

**Base Sepolia**：
- ETH faucet: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
- USDC faucet: https://faucet.circle.com/（选 Base Sepolia）

**Solana Devnet**：
- SOL faucet: https://faucet.solana.com/
- USDC faucet: https://faucet.circle.com/（选 Solana Devnet）

### 3. 运行 EVM client

```bash
# 简单运行（发起支付并打印结果）
pnpm --filter @x402-local/client run dev

# 完整报告（生成 JSON + Markdown 到 docs/reports/）
pnpm --filter @x402-local/client run evm:report
```

### 4. 运行 SVM client

```bash
# 简单运行
pnpm --filter @x402-local/client run svm:run

# 完整报告
pnpm --filter @x402-local/client run svm:report
```

## 协议概览

```
Client                    Server                   Facilitator         Chain
  |                         |                         |                  |
  |--- GET /premium/evm --->|                         |                  |
  |<-- 402 + PAYMENT-REQUIRED                         |                  |
  |                         |                         |                  |
  |  [构造签名]              |                         |                  |
  |                         |                         |                  |
  |--- GET + PAYMENT-SIGNATURE -->|                   |                  |
  |                         |--- verify ------------->|                  |
  |                         |<-- isValid=true --------|                  |
  |                         |--- settle ------------->|                  |
  |                         |                         |--- tx ---------> |
  |                         |<-- success + txHash ----|                  |
  |<-- 200 + PAYMENT-RESPONSE + body                  |                  |
```

- **EVM**：EIP-712 签名 + EIP-3009 `TransferWithAuthorization`
- **SVM**：Solana Transaction 签名 + SPL Token `TransferChecked`
- **Gas**：facilitator 代付（EVM + SVM），buyer 只需持有 USDC
- **SIWX**：CAIP-122 钱包签名认证，支持付费复访和 auth-only 两种模式

## 技术栈

- **@x402/express** 2.8.0 — Express middleware
- **@x402/extensions** 2.8.0 — SIWX (Sign-In-With-X) extension
- **@x402/evm** 2.8.0 — EVM exact scheme
- **@x402/svm** 2.8.0 — SVM exact scheme
- **@x402/core** 2.8.0 — Core protocol types and server

## 相关文档

- [x402 协议规范](https://github.com/coinbase/x402)
- [SIWX 文档](https://docs.x402.org/extensions/sign-in-with-x)
- [EVM exact scheme](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md)
- [SVM exact scheme](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_svm.md)
- [x402 官方文档](https://docs.x402.org)
- [CAIP-122 标准](https://chainagnostic.org/CAIPs/caip-122)
