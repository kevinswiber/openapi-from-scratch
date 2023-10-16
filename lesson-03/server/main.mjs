import { serve } from "./http-server.mjs";

const routes = new Map();
routes.set("/machines", {
  get: ({ response }) => {
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

    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(body));
  }
});

routes.set("/", {
  "*": ({ response }) => {
    response.end("root");
  }
});
routes.set("/machines/{id}", {
  "*": ({ response, matches }) => {
    const { id } = matches.pop().groups;
    response.end(id);
  }
});

const widgets = new Map();

widgets.set("", { get: ({ response }) => response.end('got em') });
widgets.set("/sub/{path*:[0-9\\/]+}", {
  "*": ({ response, matches, log }) => {
    log.debug(matches.pop().groups.path);
    response.end("widget sub root");
  }
});
widgets.set("/", { "*": ({ response }) => response.end("widget slash root") });
widgets.set("/{widgetId}", { "*": ({ response }) => response.end('widget item') });
routes.set("/widgets", widgets);
//routes.set(/\/widgets\/(?<widgetId2>.+)/, { "*": ({ response }) => response.end('from root widget item') });

serve(routes);
