# x402-local-lab

Local TypeScript-first lab for x402 server/client integration.

## Structure

- `apps/x402-server`: Express server with `@x402/express`
- `apps/x402-client`: fetch client with auto-payment retry via `@x402/fetch`
- `packages/signer`: signer abstraction + viem adapter (for extension)
- `packages/payment-core`: reserved for custom payment helpers
- `packages/config`: env schema validation via zod
- `packages/types`: shared types

## Quick start

```bash
~/.npm-global/bin/pnpm install
cp .env.example .env
~/.npm-global/bin/pnpm --filter @x402-local/server dev
~/.npm-global/bin/pnpm --filter @x402-local/client dev
```

## Current status

- Happy-path baseline wired to official x402 SDKs
- Next: tighten signer abstraction integration + tests + runbook
