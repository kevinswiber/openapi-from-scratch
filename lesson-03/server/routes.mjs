export const routes = new Map();

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

routes.set("/machines/(?<id>.+)", {
  "*": ({ response, matches }) => {
    const { id } = matches.pop().groups;
    response.end(id);
  }
});
