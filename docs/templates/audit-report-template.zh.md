# x402 审计风格运行报告

- 运行时间：{{meta.timestamp}}
- 资源地址：{{meta.resourceUrl}}
- Facilitator：{{meta.facilitatorUrl}}
- 耗时（毫秒）：请求1={{meta.durationMs.request1}}，请求2={{meta.durationMs.request2}}，总计={{meta.durationMs.total}}

## 一、Request（请求）

### 1.1 第一次请求
- Method：{{http.firstRequest.method}}
- URL：{{http.firstRequest.url}}
- 响应状态：{{http.firstResponse.status}}
- PAYMENT-REQUIRED（原文）：`{{http.firstResponse.headers.paymentRequired}}`
- PAYMENT-REQUIRED（解码）：

```json
{{http.firstResponse.paymentRequiredDecoded.json}}
```

### 1.2 第二次请求
- Method：{{http.secondRequest.method}}
- URL：{{http.secondRequest.url}}
- 响应状态：{{http.secondResponse.status}}
- PAYMENT-SIGNATURE（原文）：`{{http.secondRequest.headers.PAYMENT-SIGNATURE}}`

## 二、Signature（签名）

- 支付方地址（Payer）：{{addresses.payer}}
- 签名对象：

```json
{{signing.signatureObject.json}}
```

- 支付载荷（Payment Payload）：

```json
{{signing.paymentPayload.json}}
```

- 签名结果（payload.signature）：`{{signing.signatureHex}}`

## 三、Settlement（结算）

- PAYMENT-RESPONSE（原文）：`{{http.secondResponse.headers.paymentResponse}}`
- PAYMENT-RESPONSE（解码）：

```json
{{http.secondResponse.paymentResponseDecoded.json}}
```

- 结算交易哈希：`{{settlement.txHash}}`
- 网络：{{http.secondResponse.paymentResponseDecoded.network}}
- 付款方（facilitator 响应）：{{http.secondResponse.paymentResponseDecoded.payer}}

## 四、On-chain（链上）

- txHash：`{{settlement.txHash}}`
- receipt.status：{{settlement.txReceipt.status}}
- receipt.blockNumber：{{settlement.txReceipt.blockNumber}}
- receipt.from：{{settlement.txReceipt.from}}
- receipt.to：{{settlement.txReceipt.to}}
- receipt.gasUsed：{{settlement.txReceipt.gasUsed}}
- receipt.effectiveGasPrice：{{settlement.txReceipt.effectiveGasPrice}}
- receipt.logs 数量：{{settlement.logsCount}}

### 余额变化
- 运行前：ETH {{balances.before.eth}}，USDC {{balances.before.usdc}}（raw {{balances.before.usdcRaw}}）
- 运行后：ETH {{balances.after.eth}}，USDC {{balances.after.usdc}}（raw {{balances.after.usdcRaw}}）

---

> 由 scripts/render-audit-report.mjs 基于 JSON 运行产物生成（中文模板）。
