import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module'; // ← importar
import { DatabaseModule } from './shared/database/database.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    AuthModule, // ← registrar aqui
    PipelineModule,
    DatabaseModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
