import { fork } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { kill } from "node:process";
import { fileURLToPath } from "node:url";
import { threadId } from "node:worker_threads";

const pidFile = fileURLToPath(new URL("./tsc.pid", import.meta.url));

if (threadId === 0) {
  try {
    const oldPid = readFileSync(pidFile, "utf8");
    kill(oldPid, 0);
  } catch {
    run();
  }
}

function run() {
  const tsc = fork(
    fileURLToPath(
      new URL("./node_modules/typescript/lib/tsc.js", import.meta.url),
    ),
    ["--build", "--watch"],
    {
      stdio: "inherit",
      execArgv: [],
    },
  );

  tsc.on("spawn", () => {
    const pid = tsc.pid;
    writeFileSync(pidFile, pid.toString());
  });

  tsc.on("error", err => {
    console.error(err);
  });
}
