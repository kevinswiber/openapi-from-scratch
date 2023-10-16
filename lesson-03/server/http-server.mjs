import { createServer } from "node:http";
import { env, stdout } from "node:process";
import { isatty } from "node:tty";
import { formatWithOptions } from "node:util";

const kHandlers = Symbol.for("handlers");
const kRouteOptions = Symbol.for("routeOptions");

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
    this.write("info", ...args);
  },
  warn(...args) {
    this.write("warn", ...args);
  },
  error(...args) {
    this.write("error", ...args);
  },
  debug(...args) {
    this.write("debug", ...args);
  },
  trace(...args) {
    this.write("trace", ...args);
  },
  fatal(...args) {
    this.write("fatal", ...args);
  },
  write(level, ...args) {
    const entry = {
      level,
      date: new Date().toISOString(),
      message: formatWithOptions({ colors }, ...args),
    };
    stdout.write(`${formatter(entry)}\n`);
  }
};

function maybeColorizeLevel(level) {
  if (!colors) {
    return level;
  }

  switch (level) {
    case "info":
      return `\x1b[32m${level}\x1b[39m`;
    case "warn":
      return `\x1b[33m${level}\x1b[39m`;
    case "debug":
      return `\x1b[34m${level}\x1b[39m`;
    case "trace":
      return `\x1b[90m${level}\x1b[39m`;
    case "error":
    case "fatal":
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

function attemptGracefulShutdown(exitCode = 1) {
  log.info("Attempting graceful shutdown...");
  server.close(function onClose() {
    log.info("Graceful shutdown complete.");
    process.exit(exitCode);
  });
}

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, function onSignal() {
    attemptGracefulShutdown(0);
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

function createRouteTreeMap(routeMap, isRoot = true) {
  const routes = new Map();
  const stringPaths = new Map();

  for (const [path, value] of routeMap.entries()) {
    if (path instanceof RegExp) {
      if (path.test("")) {
        routes.set(kHandlers, value);
        continue;
      }
      if (!routes.has(path)) {
        routes.set(path, new Map());
      }
      let route = routes.get(path);
      route.set(kRouteOptions, { matchToEnd: true, matchString: false });
      if (value instanceof Map) {
        for (const [k, v] of createRouteTreeMap(value, false).entries()) {
          route.set(k, v);
        }
      } else {
        route.set(kHandlers, value);
      }
      continue;
    }

    stringPaths.set(path, value);
  }

  const state = { routes };
  for (const [path, value] of stringPaths.entries()) {
    if (path === "") {
      state.routes = routes;
    }

    const segments = Array.from(path).reduce((acc, char) => {
      if (char === "/") {
        acc.push("/");
      } else {
        const last = acc[acc.length - 1];
        if (last === "/") {
          acc.push(char);
        } else {
          acc[acc.length - 1] += char;
        }
      }
      return acc;
    }, []);

    for (const segment of segments) {
      if (segment.startsWith("{") && segment.endsWith("}")) {
        const adjustedSegment = segment.substr(1, segment.length - 2);
        try {
          new RegExp(`^${adjustedSegment}$`);
        } catch (err) {
          if (err instanceof SyntaxError) {
            log.warn("Invalid path syntax: `%s`. Is there an extra `/` "
              + "character in a regular expression? %O", path, err);
          }
          continue;
        }

        const re = new RegExp(`^${adjustedSegment}$`);
        if (!state.routes.has(re)) {
          state.routes.set(re, new Map());
        }
        state.routes = state.routes.get(re);
        state.routes.set(kRouteOptions, { matchToEnd: false, matchString: false });
      } else {
        if (!state.routes.has(segment)) {
          state.routes.set(segment, new Map());
        }

        state.routes = state.routes.get(segment);
        state.routes.set(kRouteOptions, { matchToEnd: false, matchString: true });
      }
    }
    if (value instanceof Map) {
      for (const [k, v] of createRouteTreeMap(value).entries()) {
        state.routes.set(k, v);
      }
    } else {
      state.routes.set(kHandlers, value);
    }
    state.routes = routes;
  }

  return routes;
};

server.on("error", function onError(err) {
  log.fatal(err);
  attemptGracefulShutdown(1);
});

server.listen(port, function onListen() {
  const { address, port, family } = server.address();
  const host = family === "IPv6" ? `[${address}]` : address;
  log.info(`Server listening on http://${host}:${port}`);
});

function ensureLeadingSlash(segment) {
  return segment.startsWith("/") ? segment : `/${segment}`;
}

function router(routes, { method, headers, url }) {
  const state = {
    routes,
    handlers: null,
    matches: [],
    fullMatch: false,
  };

  const parsedURL = new URL(url, `http://${headers.host}`);
  const { pathname } = parsedURL;

  const segments = Array.from(pathname).reduce((acc, char) => {
    if (char === "/") {
      acc.push("/");
    } else {
      const last = acc[acc.length - 1];
      if (last === "/") {
        acc.push(char);
      } else {
        acc[acc.length - 1] += char;
      }
    }
    return acc;
  }, []);

  for (const [segmentIndex, segment] of segments.entries()) {
    for (const [path, value] of state.routes.entries()) {
      if (path === kHandlers || path === kRouteOptions) {
        continue;
      }

      const options = value.get(kRouteOptions);

      const matchPath = options.matchToEnd ?
        segments.slice(segmentIndex).join("") :
        segment;

      if (options.matchString) {
        if (matchPath === path) {
          const matches = [path];
          matches.index = 0;
          matches.input = matchPath;
          matches.groups = undefined;

          if (options.matchToEnd) {
            state.fullMatch = true;
          }

          state.matches.push(matches);
          state.routes = value;
          state.handlers = value.get(kHandlers);
          break;
        }
      } else {
        const matches = path.exec(matchPath);
        if (matches) {
          if (options.matchToEnd) {
            state.fullMatch = true;
          }
          state.matches.push(matches);
          state.routes = value;
          state.handlers = value.get(kHandlers);
          break;
        }
      }
    }

    if (!state.fullMatch && state.matches.length < segmentIndex + 1) {
      state.matches = [];
      state.routes = routes;
      state.handlers = null;
      break;
    }
  }

  const inner = state.handlers?.[method.toLowerCase()] ||
    state.handlers?.["*"] || fallback(state.handlers);

  return function handlerWrap(request, response) {
    return inner({ request, response, url: parsedURL, matches: state.matches, log });
  };
}

function fallback(handlers) {
  return function({ response }) {
    if (!handlers) {
      response.statusCode = 404;
      response.end("Not found.");
      return;
    }

    response.statusCode = 406;
    response.end("Method not allowed.");
  };
}

export { serve, log };
