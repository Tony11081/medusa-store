import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { listSiteManifests } from "../../../../lib/site-builder";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const protocol = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host");
  const backendUrl = host ? `${protocol}://${host}` : null;
  const manifests = await listSiteManifests(req.scope, { backendUrl });

  res.status(200).json({
    version: 2,
    privilege: "full-admin",
    route: "/admin/site-builder/sites",
    count: manifests.length,
    items: manifests.map((manifest) => ({
      site: manifest.site,
      sales_channel: manifest.sales_channel,
      catalog: manifest.catalog,
      platform: manifest.platform,
      storefront_env: manifest.storefront_env,
      launch_readiness: manifest.launch_readiness,
      timestamps: manifest.timestamps,
    })),
  });
}
