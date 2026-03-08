import { ExecArgs } from "@medusajs/framework/types";
import { createApiKeysWorkflow } from "@medusajs/medusa/core-flows";

export default async function createApiKeyScript({
  container,
  args,
}: ExecArgs) {
  const namedArgs = getNamedArgs(args);
  const title = namedArgs.title ?? "AI Site Builder";
  const type = namedArgs.type ?? "secret";
  const createdBy = namedArgs.createdBy ?? "";

  if (type !== "secret" && type !== "publishable") {
    throw new Error("Invalid --type value. Use secret or publishable.");
  }

  const { result } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        {
          title,
          type,
          created_by: createdBy,
        },
      ],
    },
  });

  const apiKey = result[0];

  console.log(
    JSON.stringify(
      {
        id: apiKey.id,
        title: apiKey.title,
        type: apiKey.type,
        token: apiKey.token,
        redacted: apiKey.redacted,
      },
      null,
      2
    )
  );
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
