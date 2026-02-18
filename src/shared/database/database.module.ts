import { Module } from '@nestjs/common';
import { knexInstance } from '../config/knex';

@Module({
  providers: [
    {
      provide: 'Knex',
      useValue: knexInstance,
    },
  ],
  exports: ['Knex'],
})
export class DatabaseModule {}
