import { defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http";
import { siteBuilderInputSchema } from "../lib/site-builder-schema";

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/site-builder",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(siteBuilderInputSchema)],
    },
  ],
});
