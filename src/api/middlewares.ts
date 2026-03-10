import { defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http";
import {
  siteBuilderInputSchema,
  siteControlPlanePatchSchema,
  siteDeployInputSchema,
  siteLaunchInputSchema,
  siteQuickstartInputSchema,
} from "../lib/site-builder-schema";

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/site-builder",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(siteBuilderInputSchema)],
    },
    {
      matcher: "/admin/site-builder/sites/:siteRef",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(siteControlPlanePatchSchema)],
    },
    {
      matcher: "/admin/site-builder/sites/:siteRef/deploy",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(siteDeployInputSchema)],
    },
    {
      matcher: "/admin/site-builder/sites/:siteRef/launch",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(siteLaunchInputSchema)],
    },
    {
      matcher: "/admin/site-builder/quickstart",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(siteQuickstartInputSchema)],
    },
  ],
});
