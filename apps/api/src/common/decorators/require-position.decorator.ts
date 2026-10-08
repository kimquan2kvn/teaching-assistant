import { SetMetadata } from '@nestjs/common';

export const REQUIRE_POSITION_KEY = 'requirePosition';
export const RequirePosition = (type: 'HOMEROOM' | 'ANY') => SetMetadata(REQUIRE_POSITION_KEY, type);
