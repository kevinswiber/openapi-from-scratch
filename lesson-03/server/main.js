import { serve } from "./http-server.js";
import { routes } from "./routes.js";

serve({
  routes,
  protocol: "http2",
  secure: true,
  serverOptions: { allowHTTP1: true }
});
