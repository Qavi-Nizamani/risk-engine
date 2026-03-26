import { createHash } from "node:crypto";
import type { Project } from "@risk-engine/db";
import { NotFoundError } from "@risk-engine/http";
import type { ProjectRepository } from "../repositories/project.repository";
import type { ApiKeyRepository } from "../repositories/apiKey.repository";
import type { SubscriptionService } from "./subscription.service";
import { generateRawKey } from "./apiKey.service";

export class ProjectService {
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly apiKeyRepo: ApiKeyRepository,
    private readonly subscriptionService?: SubscriptionService,
  ) {}

  async create(
    organizationId: string,
    input: { name: string; environment?: "PRODUCTION" | "STAGING" | "DEV" },
  ): Promise<{ project: Project; secretKey: string; publishableKey: string }> {
    // Enforce plan project limit before creating
    if (this.subscriptionService) {
      const existing = await this.projectRepo.findAllByOrg(organizationId);
      await this.subscriptionService.enforceProjectLimit(organizationId, existing.length);
    }

    const project = await this.projectRepo.create({ organizationId, ...input });

    const secretRaw = generateRawKey("secret");
    const secretHash = createHash("sha256").update(secretRaw).digest("hex");
    await this.apiKeyRepo.create({ projectId: project.id, keyHash: secretHash, name: "Default Secret Key", type: "secret" });

    const publishableRaw = generateRawKey("publishable");
    const publishableHash = createHash("sha256").update(publishableRaw).digest("hex");
    await this.apiKeyRepo.create({ projectId: project.id, keyHash: publishableHash, name: "Default Publishable Key", type: "publishable" });

    return { project, secretKey: secretRaw, publishableKey: publishableRaw };
  }

  async listByOrg(organizationId: string): Promise<Project[]> {
    return this.projectRepo.findAllByOrg(organizationId);
  }

  async getById(organizationId: string, id: string): Promise<Project> {
    const project = await this.projectRepo.findByIdAndOrg(id, organizationId);
    if (!project) throw new NotFoundError("Project not found");
    return project;
  }

  async update(
    organizationId: string,
    id: string,
    data: { name?: string; environment?: "PRODUCTION" | "STAGING" | "DEV" },
  ): Promise<Project> {
    const updated = await this.projectRepo.updateByIdAndOrg(id, organizationId, data);
    if (!updated) throw new NotFoundError("Project not found");
    return updated;
  }

  async delete(organizationId: string, id: string): Promise<void> {
    const deleted = await this.projectRepo.deleteByIdAndOrg(id, organizationId);
    if (!deleted) throw new NotFoundError("Project not found");
  }
}
