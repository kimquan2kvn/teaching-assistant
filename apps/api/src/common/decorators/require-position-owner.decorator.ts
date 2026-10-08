import { SetMetadata } from '@nestjs/common';

export const REQUIRE_POSITION_OWNER_KEY = 'requirePositionOwner';
export type PositionOwnerRequirement = 'SELF' | 'SELF_OR_HOMEROOM';
export const RequirePositionOwner = (requirement: PositionOwnerRequirement) =>
  SetMetadata(REQUIRE_POSITION_OWNER_KEY, requirement);
