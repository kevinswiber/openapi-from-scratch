import { readFileSync, writeFileSync } from "node:fs";
import { fork, spawnSync } from "node:child_process";
import { threadId } from "node:worker_threads";

if (threadId === 0) {
  const tsc = fork(
    "./node_modules/typescript/lib/tsc.js",
    ["--build", "--watch"],
    {
      stdio: "inherit",
      execArgv: [],
    },
  );

  tsc.on("spawn", () => {
    try {
      const oldPid = readFileSync(".tsc.pid", "utf8");
      spawnSync("kill", ["-9", oldPid]);
    } catch (e) {
      // swallow
    }

    const pid = tsc.pid;
    writeFileSync(".tsc.pid", pid.toString());
  });

  tsc.on("error", err => {
    console.error(err);
  });
}
