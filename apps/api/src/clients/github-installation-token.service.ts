import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createAppAuth } from "@octokit/auth-app";

import { PrismaService } from "../prisma/prisma.service.ts";

export type InstallationAuthFactory = (options: {
  appId: string;
  privateKey: string;
  installationId: number;
}) => (authOptions: { type: "installation" }) => Promise<{ token: string }>;

/**
 * Mints short-lived GitHub App installation tokens for agent checkouts.
 * Returns null when the GitHub App is not configured or the tenant has no
 * installation — callers decide whether that is fatal.
 */
@Injectable()
export class GitHubInstallationTokenService {
  private readonly logger = new Logger(GitHubInstallationTokenService.name);
  private readonly appId: string | undefined;
  private readonly privateKey: string | undefined;
  private appAuthFactory: InstallationAuthFactory =
    createAppAuth as unknown as InstallationAuthFactory;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.appId = config.get<string>("GITHUB_APP_ID");
    const privateKeyBase64 = config.get<string>(
      "GITHUB_APP_PRIVATE_KEY_BASE64",
    );
    this.privateKey = privateKeyBase64
      ? Buffer.from(privateKeyBase64, "base64").toString("utf8")
      : undefined;
  }

  /** Test seam: replace the Octokit auth factory without Nest DI. */
  setAppAuthFactory(factory: InstallationAuthFactory): void {
    this.appAuthFactory = factory;
  }

  isConfigured(): boolean {
    return Boolean(this.appId && this.privateKey);
  }

  async mintInstallationToken(tenantId: string): Promise<string | null> {
    if (!this.appId || !this.privateKey) {
      return null;
    }

    const installation = await this.prisma.withTenant(tenantId, async (tx) =>
      tx.gitHubInstallation.findUnique({
        where: { tenantId },
        select: { installationId: true },
      }),
    );

    if (!installation) {
      this.logger.warn(
        `no GitHub installation for tenant ${tenantId}; cannot mint checkout token`,
      );
      return null;
    }

    const auth = this.appAuthFactory({
      appId: this.appId,
      privateKey: this.privateKey,
      installationId: installation.installationId,
    });
    const { token } = await auth({ type: "installation" });
    return token;
  }
}
