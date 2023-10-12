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
  },
  fallback: {
    handlers: {
      "*": (_req, res) => {
        res.setHeader("Content-Type", "text/plain");
        res.statusCode = 404;
        res.end("Not found.");
      }
    }
  }
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const segments = url.pathname.split("/").filter(Boolean);

  let subRouter = router;
  let handlers = router.fallback?.handlers;
  const allMatches = [];
  for (const segment of segments) {
    let foundMatch = false;
    for (const routeKey of Object.keys(subRouter)) {
      const re = new RegExp(`^${routeKey}$`);
      const matches = re.exec(`/${segment}`);
      if (matches) {
        foundMatch = true;
        allMatches.push(matches);
        subRouter = subRouter[routeKey];
        handlers = subRouter.handlers || handlers;
        break;
      }
    }
    if (!foundMatch) {
      break;
    }
  }

  const method = req.method.toLowerCase();
  const handler = handlers[method] || handlers["*"];

  if (!handler) {
    if (!allMatches.length) {
      res.statusCode = 404;
      res.end("Not found.");
      return;
    }

    res.statusCode = 406;
    res.end("Method not allowed.");
    return;
  }

  handler(req, res, allMatches);
});

server.listen(port, () => {
  const { address, port } = server.address();
  console.log(`Server listening on http://${address}:${port}`);
});
