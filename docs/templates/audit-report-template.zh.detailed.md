# x402 详细审计报告（中文）

- 运行时间：{{meta.timestamp}}
- 资源地址：{{meta.resourceUrl}}
- Facilitator：{{meta.facilitatorUrl}}
- 端到端耗时：{{meta.durationMs.total}} ms（首跳 {{meta.durationMs.request1}} ms + 二跳 {{meta.durationMs.request2}} ms）

---

## 0) 执行概览

本次流程遵循 x402 标准双跳模式：
1. **首跳（未携带支付）**：客户端请求受保护资源，服务端返回 `402 Payment Required` 与 `PAYMENT-REQUIRED`。
2. **二跳（携带支付签名）**：客户端根据首跳参数构造并签名支付对象，附带 `PAYMENT-SIGNATURE` 重试请求。
3. **结算与回包**：服务端校验并结算后返回 `200`，同时在 `PAYMENT-RESPONSE` 中返回结算结果。

本次结果：
- 首跳状态：`{{http.firstResponse.status}}`
- 二跳状态：`{{http.secondResponse.status}}`
- 结算交易：`{{settlement.txHash}}`

---

## 1) Request 阶段（请求与挑战）

### 1.1 首跳请求（作用）
首跳的核心作用是获取“支付挑战参数”（即服务端声明你要按什么条件付费）。

- Method：`{{http.firstRequest.method}}`
- URL：`{{http.firstRequest.url}}`
- 响应状态：`{{http.firstResponse.status}}`（预期应为 402）

### 1.2 PAYMENT-REQUIRED 关键字段解释

- `scheme`: 支付方案。当前为 `exact`（精确金额支付）。
- `network`: 链标识（CAIP 风格），如 `eip155:84532` 表示 Base Sepolia。
- `asset`: 代币合约地址（本次为 Base Sepolia USDC）。
- `amount`: 支付最小单位（USDC 6 位精度，`1000`=0.001 USDC）。
- `payTo`: 收款地址。
- `maxTimeoutSeconds`: 签名有效窗口，防止支付对象被长期重放。
- `resource`: 被保护资源描述（URL、description、mimeType）。

PAYMENT-REQUIRED 原文（header）：
`{{http.firstResponse.headers.paymentRequired}}`

PAYMENT-REQUIRED 解码：

```json
{{http.firstResponse.paymentRequiredDecoded.json}}
```

---

## 2) Signature 阶段（签名构造与参数）

### 2.1 二跳请求（作用）
二跳请求的作用是证明“付款方已同意按首跳条件支付”。

- Method：`{{http.secondRequest.method}}`
- URL：`{{http.secondRequest.url}}`
- PAYMENT-SIGNATURE（原文）：
`{{http.secondRequest.headers.PAYMENT-SIGNATURE}}`

### 2.2 签名对象解释

签名对象一般包含：
- `x402Version`：协议版本（本次 v2）
- `accepted`：实际接受的支付条款（应与 `PAYMENT-REQUIRED.accepts` 匹配）
- `payload.signature`：私钥对支付对象的签名结果
- 与 `network/asset/amount/payTo` 绑定的关键字段（防篡改）

支付方地址（Payer）：`{{addresses.payer}}`

签名对象：

```json
{{signing.signatureObject.json}}
```

支付载荷（Payment Payload）：

```json
{{signing.paymentPayload.json}}
```

签名结果（Hex）：
`{{signing.signatureHex}}`

---

## 3) Settlement 阶段（服务端验签与结算）

### 3.1 PAYMENT-RESPONSE 作用
`PAYMENT-RESPONSE` 是结算回执，说明服务端/Facilitator 已完成支付处理。

- PAYMENT-RESPONSE 原文：
`{{http.secondResponse.headers.paymentResponse}}`

- PAYMENT-RESPONSE 解码：

```json
{{http.secondResponse.paymentResponseDecoded.json}}
```

关键参数解释：
- `success`: 是否结算成功
- `transaction`: 结算交易哈希
- `network`: 结算所在网络
- `payer`: facilitator 识别到的支付方地址

---

## 4) On-chain 阶段（链上凭证）

链上核验用于把 HTTP 层回执和真实链上状态对齐。

- txHash：`{{settlement.txHash}}`
- receipt.status：`{{settlement.txReceipt.status}}`
- receipt.blockNumber：`{{settlement.txReceipt.blockNumber}}`
- receipt.from：`{{settlement.txReceipt.from}}`
- receipt.to：`{{settlement.txReceipt.to}}`
- receipt.gasUsed：`{{settlement.txReceipt.gasUsed}}`
- receipt.effectiveGasPrice：`{{settlement.txReceipt.effectiveGasPrice}}`
- receipt.logs 数量：`{{settlement.logsCount}}`

### 4.1 余额核对（运行前后）
- Before：ETH {{balances.before.eth}}，USDC {{balances.before.usdc}}（raw {{balances.before.usdcRaw}}）
- After：ETH {{balances.after.eth}}，USDC {{balances.after.usdc}}（raw {{balances.after.usdcRaw}}）

说明：若支付金额较小且同地址收款，余额变化可能不明显（尤其在展示精度较低时）。建议结合 raw 值与交易日志核对。

---

## 5) 风险与检查建议

- 检查 `accepted` 与首跳 `accepts` 是否一致（防参数替换）。
- 检查 `network/asset` 是否为预期测试网资产（防错链）。
- 检查 `maxTimeoutSeconds` 是否合理（防重放窗口过大）。
- 保证私钥仅在 client 侧存在，不进入 server 日志。
- 在生产环境启用更细粒度审计字段（requestId、nonce、签名摘要等）。

---

> 该报告由 `scripts/render-audit-report-detailed.mjs` 从 JSON 运行产物自动生成。
