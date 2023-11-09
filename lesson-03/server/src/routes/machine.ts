import type { FastifyPluginAsync } from "fastify";

type KnownRegion = "us-east-1" | "us-west-1" | "us-west-2";
type Other<T> = T & Record<never, never>;

type Machine = {
  id: string;
  region: KnownRegion | Other<string>;
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
    region: "us-west-2",
  },
];

export const register: FastifyPluginAsync = async function (fastify) {
  fastify.get("/machines", () => data);
  fastify.get<{ Params: Pick<Machine, "id"> }>(
    "/machines/:id",
    (request, reply) => {
      const { id } = request.params;
      const machine = data.find(m => m.id === id);

      if (!machine) {
        reply.code(404).send();
        return;
      }

      return machine;
    },
  );
};
