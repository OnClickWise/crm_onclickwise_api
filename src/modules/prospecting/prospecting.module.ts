import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';

import { ApolloApiClient } from './apollo/apollo-api.client';
import { ApolloCacheService } from './apollo/apollo-cache.service';

import { ProspectingCreditsService } from './credits/credits.service';
import { ProspectingCreditsController } from './credits/credits.controller';

import { ProspectingCompaniesService } from './companies/companies.service';
import { ProspectingCompaniesController } from './companies/companies.controller';
import { CompanyTeamService } from './companies/company-team.service';

import { ProspectingPeopleService } from './people/people.service';
import { ProspectingPeopleController } from './people/people.controller';

import { ProspectingListsService } from './lists/lists.service';
import { ProspectingListsController } from './lists/lists.controller';

import { ProspectingImportService } from './import/import.service';
import { ProspectingImportController } from './import/import.controller';

// Fase B
import { ProspectingIcpsService } from './icps/icps.service';
import { ProspectingIcpsController } from './icps/icps.controller';
import { ProspectingSequencesService } from './sequences/sequences.service';
import { ProspectingSequencesController } from './sequences/sequences.controller';
import { ProspectingTriggersService } from './triggers/triggers.service';
import { ProspectingTriggersController } from './triggers/triggers.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [
    ProspectingCreditsController,
    ProspectingCompaniesController,
    ProspectingPeopleController,
    ProspectingListsController,
    ProspectingImportController,
    ProspectingIcpsController,
    ProspectingSequencesController,
    ProspectingTriggersController,
  ],
  providers: [
    // Apollo low-level
    ApolloCacheService,
    ApolloApiClient,
    // Domínio
    ProspectingCreditsService,
    ProspectingCompaniesService,
    CompanyTeamService,
    ProspectingPeopleService,
    ProspectingListsService,
    ProspectingImportService,
    ProspectingIcpsService,
    ProspectingSequencesService,
    ProspectingTriggersService,
  ],
  exports: [
    ProspectingCreditsService,
    ProspectingCompaniesService,
    CompanyTeamService,
    ProspectingPeopleService,
    ProspectingListsService,
    ProspectingImportService,
    ProspectingIcpsService,
    ProspectingSequencesService,
    ProspectingTriggersService,
  ],
})
export class ProspectingModule {}
