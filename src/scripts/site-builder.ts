import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ExecArgs } from "@medusajs/framework/types";
import { buildSiteManifest } from "../lib/site-builder";
import { siteBuilderInputSchema } from "../lib/site-builder-schema";

export default async function siteBuilderScript({
  container,
  args,
}: ExecArgs) {
  const configPath = args[0];

  if (!configPath) {
    throw new Error(
      "Missing required config path. Usage: medusa exec ./src/scripts/site-builder.ts <config.json> [output=/path] [backendUrl=https://api.example.com] [createdBy=user_123]"
    );
  }

  const namedArgs = getNamedArgs(args.slice(1));
  const outputPath = namedArgs.output;
  const backendUrl = namedArgs.backendUrl;
  const createdBy = namedArgs.createdBy;
  const absoluteConfigPath = path.resolve(process.cwd(), configPath);
  const raw = await readFile(absoluteConfigPath, "utf8");
  const payload = siteBuilderInputSchema.parse(JSON.parse(raw));

  const manifest = await buildSiteManifest(container, payload, {
    backendUrl,
    createdBy,
  });
  const serialized = JSON.stringify(manifest, null, 2);

  if (outputPath) {
    await writeFile(path.resolve(process.cwd(), outputPath), serialized);
  }

  console.log(serialized);
}

function getNamedArgs(args: string[]): Record<string, string> {
  return args.reduce<Record<string, string>>((accumulator, arg) => {
    const separatorIndex = arg.indexOf("=");

    if (separatorIndex === -1) {
      return accumulator;
    }

    const key = arg.slice(0, separatorIndex);
    const value = arg.slice(separatorIndex + 1);

    if (key && value) {
      accumulator[key] = value;
    }

    return accumulator;
  }, {});
}
