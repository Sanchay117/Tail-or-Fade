// List indexer GraphQL root fields matching a pattern, and the fields of one type.
//   npx tsx scripts/indexer-schema.ts perp            root query fields containing "perp"
//   npx tsx scripts/indexer-schema.ts --type PerpPositionChange
import { network } from "../src/config.js";

const url = network().indexerUrl;
async function gql(query: string, variables: Record<string, unknown> = {}) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return r.json() as Promise<any>;
}

const args = process.argv.slice(2);
if (args[0] === "--type") {
  const res = await gql(`query($n:String!){ __type(name:$n){ name fields { name type { name kind ofType { name kind } } } } }`, { n: args[1] });
  for (const f of res.data?.__type?.fields ?? []) console.log(f.name, f.type.name ?? f.type.ofType?.name ?? f.type.kind);
  if (!res.data?.__type) console.log(JSON.stringify(res).slice(0, 500));
} else {
  const pat = (args[0] ?? "").toLowerCase();
  const res = await gql(`{ __schema { queryType { fields { name } } } }`);
  const names: string[] = (res.data?.__schema?.queryType?.fields ?? []).map((f: any) => f.name);
  console.log(names.filter((n) => n.toLowerCase().includes(pat) && !/_aggregate$|_by_pk$|_stream$/.test(n)).join("\n"));
  if (!names.length) console.log(JSON.stringify(res).slice(0, 500));
}
