import { config as loadDotenv } from "dotenv";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { createWalletClient, http, publicActions } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { loadClientConfig } from "@x402-local/config";

loadDotenv();

async function main() {
  const cfg = loadClientConfig();

  const account = privateKeyToAccount(cfg.BUYER_PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(cfg.RPC_URL),
  }).extend(publicActions);

  const evmSigner = {
    address: account.address,
    signTypedData: walletClient.signTypedData,
    readContract: walletClient.readContract,
  };

  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(evmSigner));

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const url = process.env.RESOURCE_SERVER_URL ?? "http://localhost:4020/premium/data";

  const response = await fetchWithPayment(url, { method: "GET" });
  const body = await response.json();

  console.log("status:", response.status);
  console.log("body:", body);

  const settle = new x402HTTPClient(client).getPaymentSettleResponse(name => response.headers.get(name));
  console.log("payment-settle:", JSON.stringify(settle, null, 2));
}

main().catch((err) => {
  console.error(err?.response?.data?.error ?? err);
  process.exit(1);
});
