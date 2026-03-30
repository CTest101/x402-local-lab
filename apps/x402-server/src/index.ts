import { config as loadDotenv } from "dotenv";
import path from "node:path";
import express from "express";
import {
  paymentMiddlewareFromHTTPServer,
  x402ResourceServer,
  x402HTTPResourceServer,
} from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { x402Version } from "@x402/core";
import {
  declareSIWxExtension,
  siwxResourceServerExtension,
  createSIWxSettleHook,
  createSIWxRequestHook,
  InMemorySIWxStorage,
} from "@x402/extensions/sign-in-with-x";
import { loadSharedConfig } from "@x402-local/config";

loadDotenv({ path: path.resolve(process.cwd(), "../../.env") });
const cfg = loadSharedConfig();

const evmNetwork = cfg.X402_NETWORK as `${string}:${string}`;
const svmNetwork = cfg.X402_SVM_NETWORK as `${string}:${string}`;

// --- SIWX storage (in-memory, tracks which wallets have paid) ---
const siwxStorage = new InMemorySIWxStorage();

const facilitatorClient = new HTTPFacilitatorClient({ url: cfg.X402_FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(evmNetwork, new ExactEvmScheme())
  .register(svmNetwork, new ExactSvmScheme())
  .registerExtension(siwxResourceServerExtension)        // auto-refresh nonce/timestamps
  .onAfterSettle(createSIWxSettleHook({ storage: siwxStorage })); // record payments

/**
 * Middleware: inject settlement/payment-required data into JSON response body.
 */
function injectSettlement(): express.RequestHandler {
  return (_req, res, next) => {
    const originalEnd = res.end.bind(res);
    (res as any).end = function (chunk?: any, ...args: any[]) {
      if (!chunk) return originalEnd(chunk, ...args);
      try {
        const body = JSON.parse(typeof chunk === "string" ? chunk : chunk.toString());

        const prHeader = res.getHeader("PAYMENT-RESPONSE");
        if (prHeader) {
          const settlement = JSON.parse(Buffer.from(String(prHeader), "base64").toString("utf8"));
          body.settlement = {
            success: settlement.success,
            transaction: settlement.transaction,
            network: settlement.network,
            payer: settlement.payer,
          };
        }

        const reqHeader = res.getHeader("PAYMENT-REQUIRED");
        if (reqHeader) {
          const paymentRequired = JSON.parse(Buffer.from(String(reqHeader), "base64").toString("utf8"));
          body.paymentRequired = paymentRequired;
        }

        const newBody = JSON.stringify(body);
        res.setHeader("Content-Length", Buffer.byteLength(newBody));
        return originalEnd(newBody, ...args);
      } catch {
        return originalEnd(chunk, ...args);
      }
    };
    next();
  };
}

/** Resolve price from ?amount= query param or env default */
function resolvePrice(context: any): string {
  const q = context.adapter?.getQueryParam?.("amount");
  const amount = Array.isArray(q) ? q[0] : q;
  if (amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0) {
    return amount;
  }
  return cfg.X402_PRICE_USD;
}

function unpaidBody(description: string, network: string, asset: string, payTo: string) {
  return async (context: any) => {
    const price = resolvePrice(context);
    return {
      contentType: "application/json",
      body: {
        error: "Payment required",
        description,
        price,
        network,
        asset,
        assetSymbol: "USDC",
        payTo,
        facilitator: cfg.X402_FACILITATOR_URL,
        hint: "Use ?amount=<USD> to set a custom price. Supports SIWX: paid wallets can sign in to re-access without repaying.",
      },
    };
  };
}

function unpaidBodyMulti(description: string) {
  return async (context: any) => {
    const price = resolvePrice(context);
    return {
      contentType: "application/json",
      body: {
        error: "Payment required",
        description,
        price,
        options: [
          { network: evmNetwork, asset: EVM_ASSET, assetSymbol: "USDC", payTo: cfg.X402_SELLER_PAYTO },
          { network: svmNetwork, asset: SVM_ASSET, assetSymbol: "USDC", payTo: cfg.X402_SVM_SELLER_PAYTO },
        ],
        facilitator: cfg.X402_FACILITATOR_URL,
        hint: "Supports both EVM and SVM. Pick one. Supports SIWX for repeat access.",
      },
    };
  };
}

const EVM_ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const SVM_ASSET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

// --- Routes with SIWX extension ---
const routes: Record<string, any> = {
  "GET /premium/evm": {
    accepts: [{ scheme: "exact", price: resolvePrice, network: evmNetwork, payTo: cfg.X402_SELLER_PAYTO }],
    description: "Premium x402-protected JSON (EVM)",
    mimeType: "application/json",
    extensions: declareSIWxExtension({
      statement: "Sign in to access your purchased premium content (EVM)",
    }),
    unpaidResponseBody: unpaidBody("Premium x402-protected JSON (EVM)", evmNetwork, EVM_ASSET, cfg.X402_SELLER_PAYTO),
  },
  "GET /premium/svm": {
    accepts: [{ scheme: "exact", price: resolvePrice, network: svmNetwork, asset: SVM_ASSET, payTo: cfg.X402_SVM_SELLER_PAYTO }],
    description: "Premium x402-protected JSON (SVM)",
    mimeType: "application/json",
    extensions: declareSIWxExtension({
      statement: "Sign in to access your purchased premium content (SVM)",
    }),
    unpaidResponseBody: unpaidBody("Premium x402-protected JSON (SVM)", svmNetwork, SVM_ASSET, cfg.X402_SVM_SELLER_PAYTO),
  },
  "GET /premium/multi": {
    accepts: [
      { scheme: "exact", price: resolvePrice, network: evmNetwork, payTo: cfg.X402_SELLER_PAYTO },
      { scheme: "exact", price: resolvePrice, network: svmNetwork, asset: SVM_ASSET, payTo: cfg.X402_SVM_SELLER_PAYTO },
    ],
    description: "Premium x402-protected JSON (Multi-chain)",
    mimeType: "application/json",
    extensions: declareSIWxExtension({
      statement: "Sign in to access your purchased premium content (Multi-chain)",
    }),
    unpaidResponseBody: unpaidBodyMulti("Premium x402-protected JSON (Multi-chain)"),
  },
  // Auth-only route: requires SIWX wallet signature but NO payment
  "GET /premium/profile": {
    accepts: [],
    description: "Wallet-gated profile (auth-only, no payment)",
    mimeType: "application/json",
    extensions: declareSIWxExtension({
      network: evmNetwork,
      statement: "Sign in with your wallet to view your profile",
      expirationSeconds: 300,
    }),
  },
};

// --- Build HTTP server with SIWX request hook ---
const httpServer = new x402HTTPResourceServer(resourceServer, routes)
  .onProtectedRequest(createSIWxRequestHook({ storage: siwxStorage }));

resourceServer.initialize().then(() => {
  console.log("[x402-server] resourceServer initialized");

  const evmKind = resourceServer.getSupportedKind(x402Version, evmNetwork, "exact");
  const svmKind = resourceServer.getSupportedKind(x402Version, svmNetwork, "exact");
  console.log(`[x402-server] EVM: ${evmKind ? "OK" : "NOT FOUND"}, SVM: ${svmKind ? "OK" : "NOT FOUND"}`);
  console.log("[x402-server] SIWX: enabled (standard flow, no JWT)");

  const app = express();

  // 1) Inject settlement/payment-required data into response body
  app.use(injectSettlement());

  // 2) x402 payment middleware (with SIWX hooks)
  app.use(paymentMiddlewareFromHTTPServer(httpServer, undefined, undefined, false));

  // 3) Routes
  app.get("/health", (_req, res) => { res.json({ ok: true }); });

  // SIWX storage debug endpoint
  app.get("/debug/siwx", (_req, res) => {
    res.json({
      info: "In-memory SIWX storage. Lists wallets that have paid for each resource.",
      note: "This endpoint is for debugging only. Remove in production.",
      storage: (siwxStorage as any)._storage ?? "not accessible",
    });
  });

  app.get("/premium/evm", (req, res) => {
    const price = (req.query.amount as string) || cfg.X402_PRICE_USD;
    res.json({
      data: {
        message: "x402 EVM payment succeeded (or SIWX re-auth)",
        timestamp: new Date().toISOString(),
        price,
        network: evmNetwork,
        payTo: cfg.X402_SELLER_PAYTO,
        asset: EVM_ASSET,
        assetSymbol: "USDC",
        facilitator: cfg.X402_FACILITATOR_URL,
      },
    });
  });

  app.get("/premium/svm", (req, res) => {
    const price = (req.query.amount as string) || cfg.X402_PRICE_USD;
    res.json({
      data: {
        message: "x402 SVM payment succeeded (or SIWX re-auth)",
        timestamp: new Date().toISOString(),
        price,
        network: svmNetwork,
        payTo: cfg.X402_SVM_SELLER_PAYTO,
        asset: SVM_ASSET,
        assetSymbol: "USDC",
        facilitator: cfg.X402_FACILITATOR_URL,
      },
    });
  });

  app.get("/premium/multi", (req, res) => {
    const price = (req.query.amount as string) || cfg.X402_PRICE_USD;
    res.json({
      data: {
        message: "x402 Multi-chain payment succeeded (or SIWX re-auth)",
        timestamp: new Date().toISOString(),
        price,
        info: "Unlocked using either EVM or SVM payment.",
        facilitator: cfg.X402_FACILITATOR_URL,
      },
    });
  });

  // Auth-only route: no payment needed, just wallet signature
  app.get("/premium/profile", (req, res) => {
    res.json({
      data: {
        message: "Welcome! You authenticated with your wallet (no payment needed).",
        timestamp: new Date().toISOString(),
        note: "This is an auth-only route. SIWX signature verified, no USDC charged.",
      },
    });
  });

  const port = Number(process.env.PORT ?? 4020);
  const host = process.env.HOST ?? "127.0.0.1";
  app.listen(port, host, () => {
    console.log(`[x402-server] listening on http://${host}:${port}`);
  });
}).catch((err: any) => {
  console.error("[x402-server] init failed:", err.message);
  process.exit(1);
});
