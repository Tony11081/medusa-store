import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  retrieveSiteManifest,
  updateSiteManifest,
} from "../../../../../lib/site-builder";
import { SiteControlPlanePatchInput } from "../../../../../lib/site-builder-schema";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const siteRef = req.params.siteRef;
  const protocol = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host");
  const backendUrl = host ? `${protocol}://${host}` : null;

  const manifest = await retrieveSiteManifest(req.scope, siteRef, {
    backendUrl,
  });

  if (!manifest) {
    res.status(404).json({
      type: "not_found",
      message: `Unknown managed site: ${siteRef}`,
    });
    return;
  }

  res.status(200).json(manifest);
}

export async function POST(
  req: AuthenticatedMedusaRequest<SiteControlPlanePatchInput>,
  res: MedusaResponse
) {
  const siteRef = req.params.siteRef;
  const protocol = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host");
  const backendUrl = host ? `${protocol}://${host}` : null;

  const manifest = await updateSiteManifest(
    req.scope,
    siteRef,
    req.validatedBody,
    {
      backendUrl,
    }
  );

  res.status(200).json(manifest);
}
