export const routes = new Map();

const data = [
  {
    id: "mercury",
    region: "us-east-1",
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

routes.set("/machines", {
  get: ({ response }) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(data));
  }
});

routes.set("/machines/{id}", {
  get: ({ response, matches }) => {
    const { id } = matches.pop().groups;
    const machine = data.find((m) => m.id === decodeURIComponent(id));

    if (!machine) {
      response.statusCode = 404;
      response.end();
      return;
    }

    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(machine));
  }
});
