import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type MyDayResponse } from '@lifeos/shared';
import { myDayQuerySchema, type MyDayQuery } from '@lifeos/validation';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators';
import { ApiZodQuery } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MyDayService } from './my-day.service';

@ApiTags('my-day')
@Controller('my-day')
export class MyDayController {
  constructor(private readonly myDay: MyDayService) {}

  @Get()
  @ApiOperation({
    summary: 'Daily overview: agenda, priorities, free time, habits, goals and insights',
  })
  @ApiZodQuery(myDayQuerySchema)
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(myDayQuerySchema)) query: MyDayQuery,
  ): Promise<MyDayResponse> {
    return this.myDay.get(user.userId, query.date);
  }
}

@Module({ controllers: [MyDayController], providers: [MyDayService] })
export class MyDayModule {}
