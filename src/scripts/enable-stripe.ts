import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";

const STRIPE_PROVIDER_ID = "pp_stripe_stripe";
const SYSTEM_PROVIDER_ID = "pp_system_default";

export default async function enableStripe({ container, args }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const namedArgs = getNamedArgs(args);
  const regionId = namedArgs.regionId;
  const regionName = namedArgs.regionName;
  const includeSystemFallback = namedArgs.includeSystem !== "false";

  const { data: paymentProviders = [] } = await query.graph({
    entity: "payment_provider",
    fields: ["id"],
    filters: {
      id: STRIPE_PROVIDER_ID,
    },
  });

  if (!paymentProviders.length) {
    throw new Error(
      "Stripe payment provider is not available. Set STRIPE_API_KEY and STRIPE_WEBHOOK_SECRET, then restart Medusa before running this script."
    );
  }

  const regionFilters = regionId
    ? { id: regionId }
    : regionName
      ? { name: regionName }
      : {};

  const { data: regions = [] } = await query.graph({
    entity: "region",
    fields: ["id", "name"],
    filters: regionFilters,
  });

  if (!regions.length) {
    throw new Error("No matching regions found.");
  }

  const paymentProviderIds = includeSystemFallback
    ? [STRIPE_PROVIDER_ID, SYSTEM_PROVIDER_ID]
    : [STRIPE_PROVIDER_ID];

  const updatedRegions: Array<{
    id: string;
    name: string;
    payment_providers: string[];
  }> = [];

  for (const region of regions) {
    logger.info(`Enabling Stripe for region ${region.name} (${region.id})`);

    await updateRegionsWorkflow(container).run({
      input: {
        selector: {
          id: region.id,
        },
        update: {
          payment_providers: paymentProviderIds,
        },
      },
    });

    updatedRegions.push({
      id: region.id,
      name: region.name,
      payment_providers: paymentProviderIds,
    });
  }

  console.log(
    JSON.stringify(
      {
        stripe_provider_id: STRIPE_PROVIDER_ID,
        include_system_fallback: includeSystemFallback,
        webhook_path: "/hooks/payment/stripe_stripe",
        regions: updatedRegions,
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
