import { execFileSync } from "node:child_process";

/**
 * Integration suites use Testcontainers; when Docker is not running they are
 * skipped instead of failing (unit tests remain the hard gate).
 *
 * On macOS the Docker CLI talks to a context-aware socket (Colima / Docker
 * Desktop) while Testcontainers defaults to DOCKER_HOST or
 * /var/run/docker.sock. We bridge the two here, before any container starts:
 * - DOCKER_HOST: the socket from the active docker context
 * - TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE: the in-VM path Ryuk must mount
 */
function detectDocker(): boolean {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

function resolveDockerHost(): void {
  if (process.env.DOCKER_HOST) {
    return;
  }

  try {
    const host = execFileSync(
      "docker",
      ["context", "inspect", "-f", "{{.Endpoints.docker.Host}}"],
      { encoding: "utf8", timeout: 5_000 },
    ).trim();

    if (host) {
      process.env.DOCKER_HOST = host;

      if (host.startsWith("unix://")) {
        process.env.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE ??=
          "/var/run/docker.sock";
      }
    }
  } catch {
    // Leave the environment untouched; Testcontainers will surface the error.
  }
}

export const dockerAvailable = detectDocker();

if (dockerAvailable) {
  resolveDockerHost();
}
