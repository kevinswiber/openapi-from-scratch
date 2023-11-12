import type { FastifyInstance } from "fastify";

type Machine = {
  id: string;
  region:
  | "us-east-1"
  | "us-west-1"
  | "us-west-2"
  | (string & Record<never, never>);
};

const data: Machine[] = [
  {
    id: "mercury",
    region: "us-east-1",
  },
  {
    id: "venus",
    region: "us-west-1",
  },
  {
    id: "mars",
    region: "ap-south-1",
  },
];

export async function register(fastify: FastifyInstance) {
  fastify.get("/machines", async () => data);
  fastify.get<{ Params: Pick<Machine, "id"> }>(
    "/machines/:id",
    async (request) => {
      const { id } = request.params;
      return data.find((machine) => machine.id === id);
    },
  );
}
