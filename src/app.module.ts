import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/auth/auth.module'; // ← importar
import { DatabaseModule } from './shared/database/database.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';
import { ProjectModule } from './modules/project/project.module';
import { BoardModule } from './modules/board/board.module';
import { ListModule } from './modules/list/list.module';
import { CardModule } from './modules/card/card.module';
import { LeadsModule } from '@/modules/leads/leads.module';
import { WhatsappModule } from '@/modules/whatsapp/whatsapp.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { InvestmentModule } from './modules/investment/investment.module';
import { ContributionModule } from './modules/contribution/contribution.module';
import { FinancialFlowModule } from './modules/financial-flow/financial-flow.module';
import { DividendModule } from './modules/dividend/dividend.module';
import { GoalModule } from './modules/goal/goal.module';
import { InvestorModule } from './modules/investor/investor.module';
import { ChatModule } from './modules/chat/chat.module';
import { UploadsModule } from './modules/uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),

    AuthModule, // ← registrar aqui
    OrganizationModule, // ← registrar aqui
    WhatsappModule,
    LeadsModule,
    PipelineModule,
    DatabaseModule,
    ProjectModule,
    BoardModule,
    ListModule,
    CardModule,
    PortfolioModule,
    InvestmentModule,
    ContributionModule,
    FinancialFlowModule,
    DividendModule,
    GoalModule,
    InvestorModule,
    ChatModule,
    UploadsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
