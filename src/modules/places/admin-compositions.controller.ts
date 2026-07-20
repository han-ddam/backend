import { BadRequestException, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '@modules/admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '@modules/admin/guards/admin-roles.guard';
import { AdminRoles } from '@modules/admin/decorators/admin-roles.decorator';
import { CompositionsService } from './compositions.service';

const MAX_BYTES = 5 * 1024 * 1024;

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/compositions')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@AdminRoles('SUPER_ADMIN', 'ADMIN')
export class AdminCompositionsController {
  constructor(private readonly compositions: CompositionsService) {}

  @ApiOperation({ summary: '구도 CSV 일괄 등록 (place당 교체)' })
  @ApiConsumes('multipart/form-data')
  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async import(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    return this.compositions.importCsv(file.buffer);
  }
}
