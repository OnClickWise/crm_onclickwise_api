import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

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
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
