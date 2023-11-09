import { fork } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { kill } from "node:process";
import { fileURLToPath } from "node:url";
import { threadId } from "node:worker_threads";

if (threadId === 0) {
  try {
    const oldPid = readFileSync(".tsc.pid", "utf8");
    try {
      kill(oldPid, 0);
    } catch {
      run();
    }
  } catch {
    run();
  }
}

function run() {
  const tsc = fork(
    fileURLToPath(
      new URL("./node_modules/typescript/lib/tsc.js", import.meta.url),
    ),
    ["--build", "--incremental", "--watch"],
    {
      stdio: "inherit",
      execArgv: [],
    },
  );

  tsc.on("spawn", () => {
    const pid = tsc.pid;
    writeFileSync(".tsc.pid", pid.toString());
  });

  tsc.on("error", err => {
    console.error(err);
  });
}
