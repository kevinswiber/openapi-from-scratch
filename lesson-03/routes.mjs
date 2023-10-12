export const routes = {
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
    },
    "/(?<id>.+)": {
      handlers: {
        "*": (_req, res, matches) => {
          const { id } = matches.pop().groups;
          res.end(id);
        }
      }
    }
  }
};


