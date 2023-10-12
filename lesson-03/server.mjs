import { createServer } from "node:http";
import { env } from "node:process";

const port = env.PORT || 0;

const router = {
  "/machines": {
    handlers: {
      get: (_req, res) => {
        const body = [
          {
            id: "mercury",
            region: "us-east-1",
            status: "terminated"
          },
          {
            id: "venus",
            region: "us-west-1"
          },
          {
            id: "mars",
            region: "us-west-2"
          }
        ];

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(body));
      }
    }
  }
};

const server = createServer((req, res) => {
  const handler = route(req);
  handler(req, res);
});

server.listen(port, () => {
  const { address, port } = server.address();
  console.log(`Server listening on http://${address}:${port}`);
});

function route(req) {
  const state = {
    router,
    handlers: {},
    matches: []
  };

  const url = new URL(req.url, `http://${req.headers.host}`);
  const segments = url.pathname.split("/").filter(Boolean);
  for (const segment of segments) {
    for (const path of Object.keys(state.router)) {
      const re = new RegExp(`^${path}$`);
      const matches = re.exec(`/${segment}`);
      if (matches) {
        state.matches.push(matches);
        state.router = state.router[path];
        state.handlers = state.router.handlers || state.handlers;
        break;
      }
    }
    if (!state.matches.length) {
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
