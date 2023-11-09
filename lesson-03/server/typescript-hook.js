// Usage:
//   node --import=./typescript-hook.js --watch ./dist/index.js
//
// Make changes to your TypeScript code, have it automatically
// recompiled, and see it reloaded in Node.js.
//
// This file is intended to be used as a Node.js preload module.
// The TypeScript compiler (tsc) will be run in watch mode.
// This is useful while running Node.js itself runs in watch mode.
//
// You'll need to run: npm install --save-dev typescript
//
// A pid file will be stored in the current directory to ensure
// that only one instance of tsc is running at a time.
//
// Note: Be sure to add `tsc.pid` to your `.gitignore` file.
//
// Example scripts for package.json:
//  "scripts": {
//    "build": "tsc --build",
//    "watch": "tsc --build --watch",
//    "develop": "npm run build && node --import=./typescript-hook.js --conditions=development --no-warnings=ExperimentalWarning --watch .",
//    "start": "node --conditions=production ."
//  }
//
// Author: Kevin Swiber (https://twitter.com/kevinswiber)

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
    await run();
  }
}

function run() {
  return new Promise((resolve, reject) => {
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
      const { pid } = tsc;
      writeFileSync(pidFile, pid.toString());
      resolve();
    });

    tsc.on("error", err => {
      reject(err);
    });
  });
}
