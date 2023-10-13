import { createServer } from "node:http";
import { env, stderr, stdout } from "node:process";
import { isatty } from "node:tty";
import { formatWithOptions } from "node:util";

const kHandlers = Symbol.for("handlers");

const port = env.PORT || 0;
const isCompatibleTerminal = isatty(stdout.fd) && env.TERM
  && (env.TERM !== "dumb");

const logFormat = env.LOG_FORMAT || (isCompatibleTerminal ? "pretty" : "json");

const colors = (logFormat === "pretty") && !env.NO_COLOR

const logFormatters = {
  json: (entry) => JSON.stringify(entry),
  pretty: (entry) => {
    return formatWithOptions({ colors }, "[%s] %s: %s",
      maybeColorizeDate(entry.date), maybeColorizeLevel(entry.level),
      entry.message);
  }
};
const formatter = logFormatters[logFormat];

const log = {
  info(...args) {
    const entry = {
      level: "info",
      date: new Date().toISOString(),
      message: formatWithOptions({ colors }, ...args),
    };
    stdout.write(`${formatter(entry)}\n`);
  },
  error(...args) {
    const entry = {
      level: "error",
      date: new Date().toISOString(),
      message: formatWithOptions({ colors }, ...args),
    };
    stderr.write(`${formatter(entry)}\n`);
  },
};

function maybeColorizeLevel(level) {
  if (!colors) {
    return level;
  }

  switch (level) {
    case "info":
      return `\x1b[32m${level}\x1b[39m`;
    case "error":
      return `\x1b[31m${level}\x1b[39m`;
    default:
      return level;
  }
}

function maybeColorizeDate(date) {
  if (!colors) {
    return date;
  }

  return `\x1b[90m${date}\x1b[39m`;
}

const server = createServer();

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, function onSignal() {
    log.info("Attempting graceful shutdown...");
    server.close(function onClose() {
      log.info("Graceful shutdown complete.");
      process.exit(0);
    });
  });
});

function serve(routeMap) {
  const routes = createRouteTreeMap(routeMap)
  server.on("request", function onRequest(request, response) {
    try {
      router(routes, request)?.(request, response);
    } catch (err) {
      log.error(err);
      response.statusCode = 500;
      response.setHeader("Content-Type", "text/plain");
      response.end("Internal server error.");
    }
  });
}

function createRouteTreeMap(routeMap) {
  const routes = new Map();

  const state = { routes };
  const keys = routeMap.keys();
  for (const path of keys) {
    const segments = path.split("/").map((s) => `/${s}`);
    segments.shift();
    for (const segment of segments) {
      try {
        new RegExp(`^${segment}$`);
      } catch (err) {
        if (err instanceof SyntaxError) {
          log.error("Invalid path syntax: `%s`. Is there an extra `/` "
            + "character in a regular expression?", path);
        }
        throw err;
      }

      if (!state.routes.has(segment)) {
        state.routes.set(segment, new Map());
      }
      state.routes = state.routes.get(segment);
    }
    state.routes.set(kHandlers, routeMap.get(path));
    state.routes = routes;
  }

  return routes;
};

server.on("error", function onError(err) {
  console.log(err);
});

server.listen(port, function onListen() {
  const { address, port, family } = server.address();
  const host = family === "IPv6" ? `[${address}]` : address;
  log.info(`Server listening on http://${host}:${port}`);
});

function router(routes, { method, headers, url }) {
  const state = {
    routes,
    handlers: {},
    matches: []
  };

  const { pathname } = new URL(url, `http://${headers.host}`);
  const segments = pathname.split("/").map((segment) => {
    if (segment === "") {
      return "/";
    }
    return segment;
  });
  segments.shift();

  for (const [segmentIndex, segment] of segments.entries()) {
    for (const path of state.routes.keys()) {
      if (path === kHandlers) {
        continue;
      }

      const re = new RegExp(`^${path}$`);
      const matches = segment?.startsWith("/") ?
        re.exec(segment) :
        re.exec(`/${segment}`);

      if (matches) {
        state.matches.push(matches);
        state.routes = state.routes.get(path);
        state.handlers = state.routes.get(kHandlers);
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

  const inner = state.handlers[method.toLowerCase()] ||
    state.handlers["*"] || fallback;

  return function handlerWrap(request, response) {
    return inner({ request, response, matches: state.matches, log });
  };
}

function fallback({ response, matches }) {
  if (!matches.length) {
    response.statusCode = 404;
    response.end("Not found.");
    return;
  }

  response.statusCode = 406;
  response.end("Method not allowed.");
};

export { serve, log };
