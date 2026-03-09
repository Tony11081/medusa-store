import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { getSitePlatformCapabilities } from "../../../../lib/site-platform";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const protocol = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host");
  const baseUrl = host ? `${protocol}://${host}` : null;
  const capabilities = await getSitePlatformCapabilities(req.scope, baseUrl);

  res.status(200).json(capabilities);
}
