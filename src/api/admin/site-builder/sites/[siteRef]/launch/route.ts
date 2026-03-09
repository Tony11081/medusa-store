import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { launchSite } from "../../../../../../lib/site-launch";
import { SiteLaunchInput } from "../../../../../../lib/site-builder-schema";

export async function POST(
  req: AuthenticatedMedusaRequest<SiteLaunchInput>,
  res: MedusaResponse
) {
  const siteRef = req.params.siteRef;
  const protocol = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host");
  const backendUrl = host ? `${protocol}://${host}` : null;

  const result = await launchSite(req.scope, siteRef, req.validatedBody, {
    backendUrl,
  });

  res.status(200).json(result);
}
