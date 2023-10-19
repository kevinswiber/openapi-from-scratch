// Purpose: A simple HTTP server with routing and logging.
// Author: Kevin Swiber <kswiber@gmail.com>
// Exports:
//   serve({ routes, host, port, protocol, secure, serverOptions })
//     routes: A Map of routes to handlers. Example:
//       const routes = new Map();
//       routes.set("/greeting", {
//         get: ({ response }) => {
//           response.setHeader("Content-Type", "application/json");
//           response.end(JSON.stringify({ hello: "world" }));
//         }
//       });
//     host: The hostname to listen on. Defaults to localhost.
//     port: The port to listen on. Defaults to 0 (random).
//     protocol: The protocol to use. Defaults to http1.1, supports http2.
//     secure: Whether to use TLS. Defaults to false.
//     serverOptions: Options to pass to the server constructor.
//   logger: A logger object with the following methods:
//     trace(...args): Log a trace message.
//     debug(...args): Log a debug message.
//     info(...args): Log an info message.
//     warn(...args): Log a warning message.
//     error(...args): Log an error message.
//     fatal(...args): Log a fatal message.
//     object: An object with the same methods as the logger, but which accepts
//       an object as the first argument. The object will be formatted as JSON.
//
// Logging:
//   The logger will only log messages at or above the LOG_LEVEL environment
//   variable. The LOG_STYLE environment variable controls the format of the
//   log messages. It can be set to "json" or "pretty". The default is "json".
//   The NO_COLOR environment variable can be set to disable colorized output.
//   The default is to enable colorized output if the terminal supports it.
//
// TLS:
//   The TLS_CA_CERT, TLS_SERVER_CERT, and TLS_SERVER_KEY environment variables
//   can be used to specify the paths to the CA certificate, server certificate,
//   and server key, respectively. The default values are:
//     TLS_CA_CERT: $HOME/.local/share/certs/localhost+2.pem
//     TLS_SERVER_CERT: $HOME/.local/share/certs/localhost+2.pem
//     TLS_SERVER_KEY: $HOME/.local/share/certs/localhost+2-key.pem
//
// Routing:
//   The router supports the following syntax path syntax for the Map keys:
//     /path/to/resource
//       Matches the exact string "/path/to/resource".
//     /path/to/{resource}
//       Matches the exact string "/path/to/" followed by any string. The matched
//       string will be available in the matches array as matches[0].groups.resource.
//     /path/to/{resource:regex}
//       Matches the exact string "/path/to/" followed by any string that matches the
//       given regular expression. The matched string will be available in the
//       matches array as matches[0].groups.resource.
//     /path/to/{resource*}
//       Matches the exact string "/path/to/" followed by any string. The matched
//       string will be available in the matches array as matches[0].groups.resource.
//       The router will continue to match segments until the end of the path.
//     /path/to/{resource*:regex}
//       Matches the exact string "/path/to/" followed by any string that matches the
//       given regular expression. The matched string will be available in the
//       matches array as matches[0].groups.resource.
//       The router will continue to match segments until the end of the path.
//     /regex/
//       Matches any string that matches the given regular expression. The matched
//       string will be available in the matches array as matches[0].
//
//   Route handlers support the following syntax:
//     {
//       get: ({ request, response, url, matches, logger }) => {
//         // request: The incoming request object.
//         // response: The outgoing response object.
//         // url: A URL object representing the request URL.
//         // matches: An array of matches from the router.
//         // logger: A logger object.
//       },
//       post: (..),
//       put: (..),
//       patch: (..),
//       delete: (..),
//       "*": (..)
//       [method: string]: (..)
//     }
//   The router will attempt to match the request method to a handler.
//     - If no handler is found for the HTTP method, it will fallback to 
//       the "*" handler.
//     - If no handler is found on a known path, it will return a 
//       406 Method Not Allowed response.
//     - If no handler is found, it will return a 404 Not Found response.
//
// MIT License
//
// Copyright (c) 2023 Kevin Swiber
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import {
  createServer as createHttp2Server,
  createSecureServer as createSecureHttp2Server
} from "node:http2";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { env, hrtime, stdout } from "node:process";
import { isatty } from "node:tty";
import { formatWithOptions } from "node:util";

const kHandlers = Symbol.for("handlers");
const kRouteOptions = Symbol.for("routeOptions");
const kRouteKey = Symbol.for("routeKey");

const isCompatibleTerminal = isatty(stdout.fd) && env.TERM
  && (env.TERM !== "dumb");

const defaults = {
  HOST: "localhost",
  PORT: 0,
  LOG_LEVEL: "info",
  LOG_STYLE: isCompatibleTerminal ? "pretty" : "json",
  TLS_SERVER_KEY: resolve(homedir(), ".local/share/certs/localhost+2-key.pem"),
  TLS_SERVER_CERT: resolve(homedir(), ".local/share/certs/localhost+2.pem")
};

const {
  HOST,
  PORT,
  LOG_LEVEL,
  LOG_STYLE,
  TLS_CA_CERT,
  TLS_SERVER_CERT,
  TLS_SERVER_KEY,
  NO_COLOR,
} = Object.assign(defaults, env);

const colors = (LOG_STYLE === "pretty") && !NO_COLOR
const levels = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const formatters = {
  json: (entry) => JSON.stringify(entry),
  pretty: (entry) => {
    return formatWithOptions({ colors }, "[%s] %s%s: %s",
      maybeColorizeDate(entry.date), maybeColorizeLevel(entry.level),
      entry.event ? ` (${entry.event})` : "",
      entry.message);
  }
};
const formatter = formatters[LOG_STYLE];

const logger = {
  supports(level) {
    return levels[LOG_LEVEL] <= levels[level]
  },
  write(level, ...args) {
    const entry = {
      level,
      date: new Date().toISOString(),
      message: formatWithOptions({ colors }, ...args),
    };
    stdout.write(`${formatter(entry)}\n`);
  },
  writeObject(level, obj) {
    const entry = {
      level,
      date: new Date().toISOString(),
    };
    if (obj.message) {
      obj.message = formatWithOptions({ colors }, obj.message);
    }
    stdout.write(`${formatter(Object.assign(entry, obj))}\n`);
  },
};
logger.object = { logger };

for (const level of Object.keys(levels)) {
  Object.defineProperty(logger, level, {
    value: function(...args) {
      if (this.supports(level)) {
        this.write(level, ...args);
      }
    }
  });
  Object.defineProperty(logger.object, level, {
    value: function(obj) {
      if (this.logger.supports(level)) {
        this.logger.writeObject(level, obj);
      }
    }
  });
}

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
      return `\x1b[35m${level}\x1b[39m`;
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

function maybeColorizeStatusCode(statusCode) {
  if (!colors) {
    return statusCode;
  }

  if (statusCode >= 500) {
    return `\x1b[31m${statusCode}\x1b[39m`;
  } else if (statusCode >= 400) {
    return `\x1b[33m${statusCode}\x1b[39m`;
  } else {
    return `\x1b[32m${statusCode}\x1b[39m`;
  }
}

function maybeColorizeServiceTime(serviceTime) {
  if (!colors) {
    return serviceTime;
  }

  const duration = Number(serviceTime?.slice(0, -2) || 0);

  if (duration >= 1e3) {
    return `\x1b[31m${serviceTime}\x1b[39m`;
  } else if (duration >= 500) {
    return `\x1b[33m${serviceTime}\x1b[39m`;
  } else {
    return `\x1b[32m${serviceTime}\x1b[39m`;
  }
}

function serve({
  routes,
  host = HOST,
  port = PORT,
  protocol = "http1.1",
  secure = false,
  serverOptions = {}
}) {
  const activeSessions = new Set();
  const routeTreeMap = createRouteTreeMap(routes)

  let createServer = secure ? createHttpsServer : createHttpServer;
  if (protocol === "http2") {
    createServer = secure ? createSecureHttp2Server : createHttp2Server;
  }

  if (secure) {
    serverOptions.key ||= readFileSync(TLS_SERVER_KEY);
    serverOptions.cert ||= readFileSync(TLS_SERVER_CERT);
    serverOptions.ca ||= TLS_CA_CERT
      ? readFileSync(TLS_CA_CERT)
      : undefined;
  }

  const server = createServer(serverOptions);
  server.on("error", function onError(err) {
    logger.object.fatal({
      event: "http-server-error",
      message: err
    });
    attemptGracefulShutdown(1);
  });

  server.on("listening", function onListen() {
    const { address, port, family } = server.address();
    const host = family === "IPv6" ? `[${address}]` : address;
    const scheme = secure ? "https" : "http";
    logger.object.info({
      event: "http-listen",
      host,
      port,
      family,
      message: `Server listening on ${scheme}://${host}:${port}`
    });
  });
  server.on("request", function onRequest(request, response) {
    let loggingRouteKey = undefined;
    try {
      const { routeKey, handler } = router({
        routes: routeTreeMap,
        request,
        protocol,
        activeSessions
      });
      loggingRouteKey = routeKey;
      handler?.(request, response);
    } catch (err) {
      logger.object.error({
        event: "http-routing-error",
        "http.route": loggingRouteKey,
        message: err
      });
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader("Content-Type", "text/plain");
        response.end("Internal server error.");
      }
    }
  });

  function attemptGracefulShutdown(exitCode = 1) {
    logger.object.info({
      event: "http-close",
      message: "Attempting graceful shutdown..."
    });

    if (typeof server.closeIdleConnections === "function") {
      server.closeIdleConnections();
    }

    for (const session of activeSessions) {
      if (typeof session.close === "function") {
        session.close();
      }
    }

    function closeIdleConnections() {
      for (const session of activeSessions) {
        if (session._httpMessage && !session._httpMessage.finished) {
          continue;
        }
        if (typeof session.close === "function") {
          session.close();
        } else {
          session.destroy();
        }
      }
      setImmediate(() => {
        if (activeSessions.size === 0) {
          clearInterval(killWatcher);
          return;
        }
      });
    }

    const killWatcher = setInterval(closeIdleConnections,
      server.keepAliveTimeout || 5000);
    closeIdleConnections();

    server.close(function onClose() {
      logger.object.info({
        event: "http-graceful-shutdown",
        message: "Graceful shutdown complete."
      });
      process.exit(exitCode);
    });
  }

  ["SIGINT", "SIGTERM"].forEach((signal) => {
    process.on(signal, function onSignal() {
      attemptGracefulShutdown(0);
    });
  });

  server.listen(port, host);
}

function createRouteTreeMap(routeMap, routeKeyPrefix = "") {
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
      route.set(kRouteKey, routeKeyPrefix + path);
      if (value instanceof Map) {
        for (const [k, v] of createRouteTreeMap(value, path).entries()) {
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
      const last = acc[acc.length - 1];
      const isEscaped = last?.endsWith("\\");
      if (char === "/" && !isEscaped) {
        acc.push("/");
      } else {
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
        const splitSegment = adjustedSegment.split(":", 2);
        const hasSplat = splitSegment[0]?.endsWith("*");
        const variableName = splitSegment[0]?.replace("*", "") || "segment";
        const variableExpression = `(?<${variableName}>${splitSegment[1] || ".+"})`;
        try {
          new RegExp(`^${variableExpression}$`);
        } catch (err) {
          if (err instanceof SyntaxError) {
            logger.object.warn({
              event: "http-router",
              message: formatWithOptions({ colors }, "Invalid path syntax: `%s`. %O", path, err)
            });
          }
          continue;
        }

        const re = new RegExp(`^${variableExpression}$`);
        if (!state.routes.has(re)) {
          state.routes.set(re, new Map());
        }
        state.routes = state.routes.get(re);
        state.routes.set(kRouteOptions, { matchToEnd: !!hasSplat, matchString: false });
      } else {
        if (!state.routes.has(segment)) {
          state.routes.set(segment, new Map());
        }

        state.routes = state.routes.get(segment);
        state.routes.set(kRouteOptions, { matchToEnd: false, matchString: true });
      }
    }
    const routeKey = `${routeKeyPrefix}${path}`;
    state.routes.set(kRouteKey, routeKey);
    if (value instanceof Map) {
      for (const [k, v] of createRouteTreeMap(value, routeKey).entries()) {
        state.routes.set(k, v);
      }
    } else {
      state.routes.set(kHandlers, value);
    }
    state.routes = routes;
  }

  return routes;
};

function router({
  routes,
  request: { method, headers, url },
  protocol,
  activeSessions
}) {
  const supportsTrace = logger.supports("trace");
  const state = {
    routes,
    handlers: null,
    routeKey: "",
    matches: [],
    fullMatch: false,
    startTime: hrtime.bigint()

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
  }, []).map((segment) => decodeURIComponent(segment));

  for (const [segmentIndex, segment] of segments.entries()) {
    for (const [path, value] of state.routes.entries()) {
      if ([kHandlers, kRouteOptions, kRouteKey].indexOf(path) !== -1) {
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
          state.routeKey = value.get(kRouteKey);
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
          state.routeKey = value.get(kRouteKey);
          state.handlers = value.get(kHandlers);
          break;
        }
      }
    }

    if (!state.fullMatch && state.matches.length < segmentIndex + 1) {
      state.matches = [];
      state.routes = routes;
      state.routeKey = "";
      state.handlers = null;
      break;
    }
  }

  const inner = state.handlers?.[method.toLowerCase()] ||
    state.handlers?.["*"] || fallback(state.handlers);

  function handlerWrap(request, response) {
    if (request.httpVersion === "2.0") {
      const session = request.stream.session;
      if (!activeSessions.has(session)) {
        session.on("close", () => {
          activeSessions.delete(session);
        });
        activeSessions.add(session);
      }
    } else if (protocol === "http2") {
      // this is an http/1.1 connection on an http/2 server
      if ((request.headers.connection || "").toLowerCase() === "keep-alive") {
        const socket = request.socket;
        if (!activeSessions.has(socket)) {
          socket.on("close", () => {
            activeSessions.delete(socket);
          });
          activeSessions.add(socket);
        }
      }
    }
    request.on("error", (err) => {
      logger.object.error({
        event: "http-request-error",
        message: err
      });
    });
    response.on("error", (err) => {
      logger.object.error({
        event: "http-response-error",
        message: err
      });
    });

    if (logger.supports("debug")) {
      const level = supportsTrace ? "trace" : "debug";
      const socket = request.httpVersion === "2.0"
        ? request.stream.session.socket
        : request.socket;
      response.on("finish", () => {
        const { statusCode } = response;
        const { method, url } = request;
        const { remoteAddress, remotePort } = socket;
        const path = supportsTrace ? url : (state.routeKey || "-");
        const loggableStatusCode = maybeColorizeStatusCode(statusCode);
        const duration = (hrtime.bigint() - state.startTime) / BigInt(1e6);
        const loggableDuration = supportsTrace ? ` (${maybeColorizeServiceTime(`${duration}ms`)})` : "";

        const entry = {
          event: "http-request",
          statusCode,
          remoteAddress,
          "http.method": method,
          "http.route": state.routeKey,
          "http.path": supportsTrace ? url : undefined,
          "http.duration": Number(duration),
          message:
            `${remoteAddress} ${remotePort} ${method} ${path} ` +
            `${loggableStatusCode}${loggableDuration}`
        }

        logger.object[level](entry);
      });
    }
    return inner({
      request,
      response,
      url: parsedURL,
      matches: state.matches,
      logger
    });
  }

  return { routeKey: state.routeKey, handler: handlerWrap };
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

export { serve, logger };
