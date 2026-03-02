import { Module } from '@nestjs/common';
import { knexInstance } from '../config/knex';

@Module({
  providers: [
    {
      provide: 'knex',
      useValue: knexInstance,
    },
  ],
  exports: ['knex'],
})
export class DatabaseModule {}
