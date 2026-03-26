import type { Organization, OrganizationMember } from "@risk-engine/db";
import { NotFoundError, ForbiddenError } from "@risk-engine/http";
import type { OrganizationRepository, MemberWithUser } from "../repositories/organization.repository";
import type { SubscriptionService } from "./subscription.service";

export class OrganizationService {
  constructor(
    private readonly orgRepo: OrganizationRepository,
    private readonly subscriptionService?: SubscriptionService,
  ) {}

  async create(input: { name: string; plan?: "FREE" | "PRO" | "ENTERPRISE" }): Promise<Organization> {
    return this.orgRepo.create(input);
  }

  async getById(id: string): Promise<Organization> {
    const org = await this.orgRepo.findById(id);
    if (!org) throw new NotFoundError("Organization not found");
    return org;
  }

  async addMember(
    orgId: string,
    input: { userId: string; role: "OWNER" | "ADMIN" | "MEMBER" },
    callerOrgId: string,
  ): Promise<OrganizationMember> {
    if (callerOrgId !== orgId) throw new ForbiddenError("Access denied");

    // Enforce plan member limit before adding
    if (this.subscriptionService) {
      const existing = await this.orgRepo.findMembersByOrg(orgId);
      await this.subscriptionService.enforceMemberLimit(orgId, existing.length);
    }

    return this.orgRepo.addMember({ organizationId: orgId, ...input });
  }

  async listMembers(orgId: string, callerOrgId: string): Promise<MemberWithUser[]> {
    if (callerOrgId !== orgId) throw new ForbiddenError("Access denied");
    return this.orgRepo.findMembersByOrg(orgId);
  }

  async updateOrg(
    id: string,
    data: { name?: string; plan?: "FREE" | "PRO" | "ENTERPRISE" },
    callerOrgId: string,
  ): Promise<Organization> {
    if (callerOrgId !== id) throw new ForbiddenError("Access denied");
    const updated = await this.orgRepo.updateOrg(id, data);
    if (!updated) throw new NotFoundError("Organization not found");
    return updated;
  }
}
