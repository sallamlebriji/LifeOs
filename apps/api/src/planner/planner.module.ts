import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  changeDecisionSchema,
  type ChangeDecisionInput,
  chatMessageSchema,
  type ChatMessageInput,
  type PlanRequest,
  planRequestSchema,
} from '@lifeos/validation';
import { type Request } from 'express';
import { CalendarModule } from '../calendar/calendar.module';
import { type AuthenticatedUser, clientIp, CurrentUser } from '../common/decorators';
import { ApiZodBody } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PlannerService } from './planner.service';

@ApiTags('planner')
@Controller('planner')
export class PlannerController {
  constructor(private readonly planner: PlannerService) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether the AI assistant is configured (the form-based planner always works)' })
  status() {
    return this.planner.status();
  }

  @Get('proposals')
  @ApiOperation({ summary: 'Recent proposals (expired ones are marked as such)' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.planner.list(user.userId);
  }

  @Post('proposals')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Compute a proposal with the deterministic engine. Nothing is written to the calendar.' })
  @ApiZodBody(planRequestSchema)
  propose(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(planRequestSchema)) body: PlanRequest) {
    return this.planner.propose(user.userId, body);
  }

  @Get('proposals/:id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.planner.get(user.userId, id);
  }

  @Patch('proposals/:id/changes/:changeId')
  @ApiOperation({ summary: 'Accept, reject or move one proposed change (moves are checked against your calendar)' })
  @ApiZodBody(changeDecisionSchema)
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('changeId', new ParseUUIDPipe()) changeId: string,
    @Body(new ZodValidationPipe(changeDecisionSchema)) body: ChangeDecisionInput,
  ) {
    return this.planner.decide(user.userId, id, changeId, body);
  }

  @Post('proposals/:id/apply')
  @ApiOperation({ summary: 'Apply all non-rejected changes in one transaction; 409 STALE_PROPOSAL if anything changed since' })
  apply(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request) {
    return this.planner.apply(user.userId, id, clientIp(req));
  }

  @Post('proposals/:id/reject')
  reject(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.planner.reject(user.userId, id);
  }

  @Post('proposals/:id/regenerate')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Recompute from the same request; the old proposal becomes SUPERSEDED' })
  regenerate(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.planner.regenerate(user.userId, id);
  }

  @Post('proposals/:id/revert')
  @ApiOperation({ summary: 'Undo an applied proposal (removes the blocks and events it created, if unedited)' })
  revert(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.planner.revert(user.userId, id);
  }

  @Post('chat')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Describe what to plan; the AI extracts a structured request and the engine builds a proposal. 503 when AI is not configured.' })
  @ApiZodBody(chatMessageSchema)
  chat(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(chatMessageSchema)) body: ChatMessageInput) {
    return this.planner.chat(user.userId, body.message, body.conversationId);
  }

  @Get('conversations/:id')
  conversation(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.planner.conversation(user.userId, id);
  }
}

@Module({ imports: [CalendarModule], controllers: [PlannerController], providers: [PlannerService] })
export class PlannerModule {}
