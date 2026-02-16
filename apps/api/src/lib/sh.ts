import { spawn } from "node:child_process";

export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export async function run(argv: string[], opts?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<RunResult> {
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (result: RunResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const child = spawn(argv[0], argv.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: opts?.cwd,
      env: { ...process.env, ...(opts?.env ?? {}) },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));

    child.on("error", (error) => {
      finish({
        code: 1,
        stdout,
        stderr: stderr || (error instanceof Error ? error.message : String(error)),
      });
    });

    child.on("close", (code: number | null) => {
      finish({ code: Number(code ?? 1), stdout, stderr });
    });
  });
}

export async function runOrThrow(
  argv: string[],
  opts?: { cwd?: string; env?: NodeJS.ProcessEnv; label?: string },
): Promise<RunResult> {
  const res = await run(argv, opts);
  if (res.code !== 0) {
    const label = opts?.label ? `${opts.label}: ` : "";
    throw new Error(`${label}command failed (${res.code}): ${argv.join(" ")}\n${res.stderr || res.stdout}`);
  }
  return res;
}
