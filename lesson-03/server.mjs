import { createServer } from "node:http";
import { env } from "node:process";
import { routes } from "./routes.mjs";

const port = env.PORT || 0;

const server = createServer((req, res) => {
  const handler = router(routes, req);
  handler(req, res);
});

server.listen(port, () => {
  const { address, port } = server.address();
  console.log(`Server listening on http://${address}:${port}`);
});

function router(routes, req) {
  const state = {
    routes,
    handlers: {},
    matches: []
  };

  const url = new URL(req.url, `http://${req.headers.host}`);
  const segments = url.pathname.split("/").map((segment) => {
    if (segment === "") {
      return "/";
    }
    return segment;
  });
  segments.shift();

  for (const [segmentIndex, segment] of segments.entries()) {
    for (const path of Object.keys(state.routes)) {
      const re = new RegExp(`^${path}$`);
      const matches = segment?.startsWith("/") ?
        re.exec(segment) :
        re.exec(`/${segment}`);

      if (matches) {
        state.matches.push(matches);
        state.routes = state.routes[path];
        state.handlers = state.routes.handlers;
        break;
      }
    }

    if (state.matches.length < segmentIndex + 1) {
      state.matches = [];
      state.routes = routes;
      state.handlers = {};
      break;
    }
  }

  const method = req.method.toLowerCase();
  const inner = state.handlers[method] || state.handlers["*"] || fallback;
  return function(req, res) {
    return inner(req, res, state.matches);
  };
}

function fallback(_req, res, matches) {
  if (!matches.length) {
    res.statusCode = 404;
    res.end("Not found.");
    return;
  }

  res.statusCode = 406;
  res.end("Method not allowed.");
};
