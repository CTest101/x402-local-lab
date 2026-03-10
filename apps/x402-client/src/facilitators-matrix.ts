import fs from "node:fs";
import path from "node:path";

const defaultFacilitators = [
  "https://x402.org/facilitator",
];

function uniq<T>(arr: T[]) {
  return [...new Set(arr)];
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

function markdownMatrix(results: any[]) {
  const lines: string[] = [];
  lines.push("# x402 Facilitator Network Matrix");
  lines.push("");
  lines.push(`GeneratedAt: ${new Date().toISOString()}`);
  lines.push("");

  for (const r of results) {
    lines.push(`## ${r.facilitator}`);
    if (!r.ok) {
      lines.push(`- Status: FAIL (${r.status})`);
      lines.push(`- Error: ${r.error}`);
      lines.push("");
      continue;
    }

    lines.push(`- Status: OK`);
    lines.push(`- Extensions: ${r.extensions.join(", ") || "(none)"}`);
    lines.push("");
    lines.push("Supported kinds:");

    if (!r.kinds.length) {
      lines.push("- (none)");
    } else {
      for (const k of r.kinds) {
        lines.push(
          `- v${k.x402Version} | scheme=${k.scheme} | network=${k.network}` +
            (k.extra ? ` | extra=${JSON.stringify(k.extra)}` : ""),
        );
      }
    }

    const signerFamilies = Object.keys(r.signers || {});
    lines.push("");
    lines.push("Signers:");
    if (!signerFamilies.length) {
      lines.push("- (none)");
    } else {
      for (const fam of signerFamilies) {
        lines.push(`- ${fam}: ${(r.signers[fam] || []).join(", ")}`);
      }
    }
    lines.push("");
  }

  const allNetworks = uniq(
    results
      .filter(r => r.ok)
      .flatMap(r => (r.kinds || []).map((k: any) => `v${k.x402Version}:${k.network}`)),
  ).sort();

  lines.push("## Aggregated Networks");
  if (!allNetworks.length) {
    lines.push("- (none)");
  } else {
    for (const n of allNetworks) lines.push(`- ${n}`);
  }

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
  const mdPath = path.join(outDir, `facilitators-matrix-${ts}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  fs.writeFileSync(mdPath, markdownMatrix(results));

  console.log(JSON.stringify({ facilitators, jsonPath, mdPath }, null, 2));
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
