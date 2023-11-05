import { env } from "node:process";
import Fastify from "fastify";
import { options as loggerOptions } from "#internal/logger.js";

const fastify = Fastify({
  logger: loggerOptions,
});

const data = [
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

fastify.get("/machines", async function handler(_request, _reply) {
  return data;
});

fastify.get("/machines/:id", async function handler(request, reply) {
  const { id } = request.params;
  const machine = data.find((m) => m.id === id);
  if (!machine) {
    reply.code(404).send();
    return;
  }
  return machine;
});

try {
  fastify.listen({
    port: env.PORT || 3000
  });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
