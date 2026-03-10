import fs from "node:fs";
import path from "node:path";

const defaultFacilitators = [
  "https://x402.org/facilitator",
  "https://facilitator.payai.network",
  "https://facilitator.corbits.dev",
];

function uniq<T>(arr: T[]) {
  return [...new Set(arr)];
}

function isTestnet(network: string) {
  const n = network.toLowerCase();
  return (
    n.includes("sepolia") ||
    n.includes("devnet") ||
    n.includes("testnet") ||
    n.includes("amoy") ||
    n.includes("fuji") ||
    n.endsWith(":2")
  );
}

async function fetchSupported(url: string) {
  const endpoint = `${url.replace(/\/$/, "")}/supported`;
  try {
    const res = await fetch(endpoint, {
      headers: { "content-type": "application/json" },
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        facilitator: url,
        ok: false,
        status: res.status,
        error: text.slice(0, 300),
      };
    }
    const json = JSON.parse(text);
    return {
      facilitator: url,
      ok: true,
      kinds: Array.isArray(json?.kinds) ? json.kinds : [],
      extensions: Array.isArray(json?.extensions) ? json.extensions : [],
      signers: json?.signers ?? {},
    };
  } catch (e: any) {
    return {
      facilitator: url,
      ok: false,
      status: 0,
      error: e?.message ?? String(e),
    };
  }
}

function markdownMatrixZh(results: any[]) {
  const lines: string[] = [];
  lines.push("# x402 Facilitator 支持矩阵（中文）");
  lines.push("");
  lines.push(`生成时间：${new Date().toISOString()}`);
  lines.push("");

  for (const r of results) {
    lines.push(`## ${r.facilitator}`);
    if (!r.ok) {
      lines.push(`- 状态：失败 (${r.status})`);
      lines.push(`- 错误：${r.error}`);
      lines.push("");
      continue;
    }

    const kinds = r.kinds || [];
    const testCount = kinds.filter((k: any) => isTestnet(k.network)).length;
    const mainCount = kinds.length - testCount;

    lines.push(`- 状态：成功`);
    lines.push(`- 支持 kinds：${kinds.length}`);
    lines.push(`- 主网项：${mainCount} | 测试网项：${testCount}`);
    lines.push(`- Extensions：${r.extensions.join(", ") || "(无)"}`);
    lines.push("");
    lines.push("支持明细：");

    if (!kinds.length) {
      lines.push("- (无)");
    } else {
      for (const k of kinds) {
        const flag = isTestnet(k.network) ? "测试网" : "主网";
        lines.push(
          `- [${flag}] v${k.x402Version} | scheme=${k.scheme} | network=${k.network}` +
            (k.extra ? ` | extra=${JSON.stringify(k.extra)}` : ""),
        );
      }
    }

    const signerFamilies = Object.keys(r.signers || {});
    lines.push("");
    lines.push("签名者（按链族）：");
    if (!signerFamilies.length) {
      lines.push("- (无)");
    } else {
      for (const fam of signerFamilies) {
        lines.push(`- ${fam}: ${(r.signers[fam] || []).join(", ")}`);
      }
    }
    lines.push("");
  }

  const allKinds = results
    .filter(r => r.ok)
    .flatMap(r => r.kinds || []);
  const allNetworks = uniq(allKinds.map((k: any) => `v${k.x402Version}:${k.network}`)).sort();

  lines.push("## 汇总");
  lines.push(`- Facilitator 数量：${results.length}`);
  lines.push(`- 可用 Facilitator：${results.filter(r => r.ok).length}`);
  lines.push(`- 网络条目总数（去重后）：${allNetworks.length}`);
  lines.push(`- 测试网条目：${allKinds.filter((k: any) => isTestnet(k.network)).length}`);
  lines.push(`- 主网条目：${allKinds.filter((k: any) => !isTestnet(k.network)).length}`);
  lines.push("");
  lines.push("全部网络（去重）：");
  for (const n of allNetworks) lines.push(`- ${n}`);

  lines.push("");
  return lines.join("\n");
}

async function main() {
  const arg = process.argv[2];
  const facilitators = arg
    ? arg.split(",").map(s => s.trim()).filter(Boolean)
    : defaultFacilitators;

  const results = await Promise.all(facilitators.map(fetchSupported));

  const outDir = path.resolve(process.cwd(), "../../docs/reports");
  fs.mkdirSync(outDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `facilitators-matrix-${ts}.json`);
  const mdPath = path.join(outDir, `facilitators-matrix-zh-${ts}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  fs.writeFileSync(mdPath, markdownMatrixZh(results));

  console.log(JSON.stringify({ facilitators, jsonPath, mdPath }, null, 2));
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
