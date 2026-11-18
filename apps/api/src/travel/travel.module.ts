/**
 * Travel: trips with itinerary activities, checklist, budget and document
 * references. A trip with `blocksCalendar` is treated as unavailable time by
 * the planner (see PlannerService.context).
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Prisma } from '@lifeos/database';
import { type TripChecklistItem, type TripDto } from '@lifeos/shared';
import {
  createTripSchema,
  listTripsQuerySchema,
  tripActivitySchema,
  updateTripSchema,
  type z,
} from '@lifeos/validation';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators';
import { userTimezone } from '../common/module-helpers';
import { ApiZodBody, ApiZodQuery } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

type CreateTrip = z.output<typeof createTripSchema>;
type UpdateTrip = z.output<typeof updateTripSchema>;
type ActivityInput = z.output<typeof tripActivitySchema>;

const include = { activities: { orderBy: [{ startAt: 'asc' }, { sortOrder: 'asc' }] } } satisfies Prisma.TripInclude;
type Row = Prisma.TripGetPayload<{ include: typeof include }>;

const arr = <T>(v: Prisma.JsonValue | null): T[] => (Array.isArray(v) ? (v as unknown as T[]) : []);
const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));
const json = (v: unknown) => v as Prisma.InputJsonValue;

function toDto(t: Row): TripDto {
  const activities = t.activities.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    location: a.location,
    startAt: a.startAt?.toISOString() ?? null,
    endAt: a.endAt?.toISOString() ?? null,
    reservation: a.reservation,
    cost: num(a.cost),
  }));
  return {
    id: t.id,
    title: t.title,
    destination: t.destination,
    departureAt: t.departureAt.toISOString(),
    returnAt: t.returnAt.toISOString(),
    timezone: t.timezone,
    status: t.status,
    transportation: t.transportation,
    accommodation: t.accommodation,
    budgetAmount: num(t.budgetAmount),
    budgetCurrency: t.budgetCurrency,
    spent: activities.reduce((s, a) => s + (a.cost ?? 0), 0),
    companions: arr<string>(t.companions),
    checklist: arr<TripChecklistItem>(t.checklist),
    documents: arr<{ label: string; reference: string }>(t.documents),
    notes: t.notes,
    blocksCalendar: t.blocksCalendar,
    activities,
  };
}

@Injectable()
export class TravelService {
  constructor(private readonly prisma: PrismaService) {}

  private async load(userId: string, id: string) {
    const t = await this.prisma.trip.findFirst({ where: { id, userId }, include });
    if (!t) throw new NotFoundException('Trip not found');
    return t;
  }

  async list(userId: string, past = false) {
    const now = new Date();
    const rows = await this.prisma.trip.findMany({
      where: { userId, ...(past ? { returnAt: { lt: now } } : { returnAt: { gte: now } }) },
      include,
      orderBy: { departureAt: past ? 'desc' : 'asc' },
      take: 100,
    });
    return rows.map(toDto);
  }

  async get(userId: string, id: string) {
    return toDto(await this.load(userId, id));
  }

  async create(userId: string, input: CreateTrip) {
    const timezone = input.timezone ?? (await userTimezone(this.prisma, userId)).timezone;
    const t = await this.prisma.trip.create({
      data: {
        userId,
        title: input.title,
        destination: input.destination,
        departureAt: input.departureAt,
        returnAt: input.returnAt,
        timezone,
        status: input.status,
        transportation: input.transportation ?? null,
        accommodation: input.accommodation ?? null,
        budgetAmount: input.budgetAmount ?? null,
        budgetCurrency: input.budgetCurrency ?? null,
        companions: json(input.companions),
        checklist: json(input.checklist),
        documents: json(input.documents),
        notes: input.notes ?? null,
        blocksCalendar: input.blocksCalendar,
      },
      include,
    });
    return toDto(t);
  }

  async update(userId: string, id: string, input: UpdateTrip) {
    const current = await this.load(userId, id);
    const departureAt = input.departureAt ?? current.departureAt;
    const returnAt = input.returnAt ?? current.returnAt;
    if (returnAt <= departureAt) {
      const message = 'Return must be after departure';
      throw new BadRequestException({ statusCode: 400, error: 'Bad Request', message, issues: { returnAt: [message] } });
    }
    const { companions, checklist, documents, ...rest } = input;
    const t = await this.prisma.trip.update({
      where: { id },
      data: {
        ...rest,
        ...(companions ? { companions: json(companions) } : {}),
        ...(checklist ? { checklist: json(checklist) } : {}),
        ...(documents ? { documents: json(documents) } : {}),
      },
      include,
    });
    return toDto(t);
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.trip.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Trip not found');
  }

  async addActivity(userId: string, tripId: string, input: ActivityInput) {
    await this.load(userId, tripId);
    const last = await this.prisma.tripActivity.aggregate({ where: { tripId }, _max: { sortOrder: true } });
    await this.prisma.tripActivity.create({
      data: {
        tripId,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        startAt: input.startAt ?? null,
        endAt: input.endAt ?? null,
        reservation: input.reservation ?? null,
        cost: input.cost ?? null,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
    return this.get(userId, tripId);
  }

  async replaceActivity(userId: string, tripId: string, activityId: string, input: ActivityInput) {
    const { count } = await this.prisma.tripActivity.updateMany({
      where: { id: activityId, tripId, trip: { userId } },
      data: {
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        startAt: input.startAt ?? null,
        endAt: input.endAt ?? null,
        reservation: input.reservation ?? null,
        cost: input.cost ?? null,
      },
    });
    if (count === 0) throw new NotFoundException('Activity not found');
    return this.get(userId, tripId);
  }

  async removeActivity(userId: string, tripId: string, activityId: string) {
    const { count } = await this.prisma.tripActivity.deleteMany({ where: { id: activityId, tripId, trip: { userId } } });
    if (count === 0) throw new NotFoundException('Activity not found');
    return this.get(userId, tripId);
  }
}

@ApiTags('travel')
@Controller('trips')
export class TravelController {
  constructor(private readonly travel: TravelService) {}

  @Get()
  @ApiOperation({ summary: 'Upcoming and ongoing trips (`past=true` for past ones)' })
  @ApiZodQuery(listTripsQuerySchema)
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listTripsQuerySchema)) q: { past?: boolean }) {
    return this.travel.list(user.userId, q.past);
  }

  @Post()
  @ApiZodBody(createTripSchema)
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createTripSchema)) body: CreateTrip) {
    return this.travel.create(user.userId, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.travel.get(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a trip; checklist/companions/documents arrays replace the stored ones' })
  @ApiZodBody(updateTripSchema)
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(updateTripSchema)) body: UpdateTrip) {
    return this.travel.update(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.travel.remove(user.userId, id);
  }

  @Post(':id/activities')
  @ApiZodBody(tripActivitySchema)
  addActivity(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(tripActivitySchema)) body: ActivityInput) {
    return this.travel.addActivity(user.userId, id, body);
  }

  @Put(':id/activities/:activityId')
  @ApiZodBody(tripActivitySchema)
  replaceActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Body(new ZodValidationPipe(tripActivitySchema)) body: ActivityInput,
  ) {
    return this.travel.replaceActivity(user.userId, id, activityId, body);
  }

  @Delete(':id/activities/:activityId')
  removeActivity(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string, @Param('activityId', new ParseUUIDPipe()) activityId: string) {
    return this.travel.removeActivity(user.userId, id, activityId);
  }
}

@Module({ controllers: [TravelController], providers: [TravelService] })
export class TravelModule {}
