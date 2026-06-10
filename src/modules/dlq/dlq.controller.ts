import {
  Controller,
  Get,
  Post,
  Query,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { DLQRecoveryService } from './dlq-recovery.service';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('admin/dlq')
export class DLQController {
  constructor(private readonly dlqService: DLQRecoveryService) {}

  @Get('stats')
  async getStats() {
    const stats = await this.dlqService.getDLQStats();

    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: stats,
    };
  }

  @Get('stats/:entity')
  async getEntityStats(@Param('entity') entity: string) {
    const allStats = await this.dlqService.getDLQStats();

    if (!allStats[entity]) {
      return {
        success: false,
        error: `Entity '${entity}' not found`,
      };
    }

    return {
      success: true,
      entity,
      stats: allStats[entity],
    };
  }

  @Post('retry')
  @HttpCode(HttpStatus.OK)
  async manualRetry(
    @Query('entity') entity: string,
    @Query('operation') operation: string,
  ) {
    try {
      const count = await this.dlqService.manualRetry(entity, operation);

      return {
        success: true,
        message: `Processed ${count} DLQ entries`,
        entity,
        operation,
        processedCount: count,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        entity,
        operation,
      };
    }
  }

  @Post('retry-all')
  @HttpCode(HttpStatus.OK)
  async retryAll() {
    try {
      await this.dlqService.processAllDLQs();

      return {
        success: true,
        message: 'DLQ recovery triggered for all queues',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get('permanent-failures')
  async getPermanentFailures(
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 100;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

    const failures = await this.dlqService.getPermanentFailures(limit, offset);

    return {
      success: true,
      data: failures,
      pagination: {
        limit,
        offset,
        count: failures.length,
      },
    };
  }

  @Post('clear-permanent')
  @HttpCode(HttpStatus.OK)
  async clearPermanentFailures(@Query('limit') limitStr?: string) {
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const cleared = await this.dlqService.clearPermanentFailures(limit);

    return {
      success: true,
      message: limit
        ? `Cleared ${cleared} permanent failures`
        : `Cleared all ${cleared} permanent failures`,
      cleared,
    };
  }

  @Get('health')
  @Public()
  async healthCheck() {
    const stats = await this.dlqService.getDLQStats();

    const totalDLQ = stats.totalDLQ || 0;
    const permanentFailures = stats.permanentFailures || 0;

    // Define health thresholds
    const DLQ_WARNING_THRESHOLD = 100;
    const DLQ_CRITICAL_THRESHOLD = 1000;
    const PERMANENT_WARNING_THRESHOLD = 50;
    const PERMANENT_CRITICAL_THRESHOLD = 200;

    let status = 'healthy';
    const issues: string[] = [];

    if (totalDLQ >= DLQ_CRITICAL_THRESHOLD) {
      status = 'critical';
      issues.push(`DLQ count critical: ${totalDLQ}`);
    } else if (totalDLQ >= DLQ_WARNING_THRESHOLD) {
      status = 'warning';
      issues.push(`DLQ count elevated: ${totalDLQ}`);
    }

    if (permanentFailures >= PERMANENT_CRITICAL_THRESHOLD) {
      status = 'critical';
      issues.push(`Permanent failures critical: ${permanentFailures}`);
    } else if (permanentFailures >= PERMANENT_WARNING_THRESHOLD) {
      if (status !== 'critical') status = 'warning';
      issues.push(`Permanent failures elevated: ${permanentFailures}`);
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      metrics: {
        totalDLQ,
        permanentFailures,
      },
      issues: issues.length > 0 ? issues : null,
      thresholds: {
        dlq: {
          warning: DLQ_WARNING_THRESHOLD,
          critical: DLQ_CRITICAL_THRESHOLD,
        },
        permanent: {
          warning: PERMANENT_WARNING_THRESHOLD,
          critical: PERMANENT_CRITICAL_THRESHOLD,
        },
      },
    };
  }

  @Get('export-failures')
  async exportFailures() {
    const failures = await this.dlqService.getPermanentFailures(1000, 0);

    return {
      success: true,
      exportedAt: new Date().toISOString(),
      count: failures.length,
      failures,
    };
  }

  @Get('report')
  async getReport() {
    const stats = await this.dlqService.getDLQStats();

    // Group by entity
    const entitySummary = Object.entries(stats)
      .filter(([key]) => key !== 'permanentFailures' && key !== 'totalDLQ')
      .map(([entity, operations]) => ({
        entity,
        total: Object.values(operations as any).reduce(
          (sum: number, count: any) => sum + count,
          0,
        ),
        operations,
      }))
      .sort((a: any, b: any) => b.total - a.total);

    return {
      success: true,
      generatedAt: new Date().toISOString(),
      summary: {
        totalDLQEntries: stats.totalDLQ || 0,
        permanentFailures: stats.permanentFailures || 0,
        entitiesAffected: entitySummary.length,
      },
      entityBreakdown: entitySummary,
    };
  }
}
