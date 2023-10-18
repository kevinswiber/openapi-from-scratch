import { serve } from "./http-server.js";
import { routes } from "./routes.js";

serve({
  routes,
  secure: true,
});
