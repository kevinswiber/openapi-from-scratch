import { env } from "node:process";
import Fastify from "fastify";
import { options as loggerOptions } from "#internal/logger";
import { register as registerMachines } from "#internal/routes/machine";

const fastify = Fastify({
  logger: loggerOptions,
});

fastify.register(registerMachines);

try {
  await fastify.listen({
    port: +env.PORT || 3000,
  });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
