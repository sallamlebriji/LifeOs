/** Categories (Work, Personal, Sport…) used to colour and group everything. */
import {
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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type CategoryDto } from '@lifeos/shared';
import { createCategorySchema, updateCategorySchema, type z } from '@lifeos/validation';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators';
import { ApiZodBody } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

type CreateCategory = z.output<typeof createCategorySchema>;
type UpdateCategory = z.output<typeof updateCategorySchema>;
const select = { id: true, name: true, color: true, kind: true, icon: true, sortOrder: true } as const;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<CategoryDto[]> {
    return this.prisma.category.findMany({ where: { userId }, select, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async create(userId: string, input: CreateCategory): Promise<CategoryDto> {
    const last = await this.prisma.category.aggregate({ where: { userId }, _max: { sortOrder: true } });
    return this.prisma.category.create({
      data: { userId, ...input, icon: input.icon ?? null, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      select,
    });
  }

  async update(userId: string, id: string, input: UpdateCategory): Promise<CategoryDto> {
    const { count } = await this.prisma.category.updateMany({ where: { id, userId }, data: input });
    if (count === 0) throw new NotFoundException('Category not found');
    return this.prisma.category.findUniqueOrThrow({ where: { id }, select });
  }

  /** Items in the category are kept and become uncategorised. */
  async remove(userId: string, id: string) {
    const { count } = await this.prisma.category.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Category not found');
  }
}

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.categories.list(user.userId);
  }

  @Post()
  @ApiZodBody(createCategorySchema)
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategory) {
    return this.categories.create(user.userId, body);
  }

  @Patch(':id')
  @ApiZodBody(updateCategorySchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategory,
  ) {
    return this.categories.update(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.categories.remove(user.userId, id);
  }
}

@Module({ controllers: [CategoriesController], providers: [CategoriesService] })
export class CategoriesModule {}
