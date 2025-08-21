import { Router } from 'express';
import { db } from '../db/connection';
import { exportJobs, stitchedLeads, auditTrail, stitchLinks, normalizedRows } from '../db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { ValidationError, NotFoundError, asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { stringify } from 'csv-stringify';
import Joi from 'joi';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

// Validation schemas
const exportSchema = Joi.object({
  timeframe: Joi.object({
    from: Joi.date().iso().optional(),
    to: Joi.date().iso().optional(),
  }).optional(),
  policyId: Joi.number().integer().positive().optional(),
  columns: Joi.array().items(Joi.string()).optional(),
});

// In-memory export job storage (in production, use database)
interface ExportJobData {
  id: string;
  accountId: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  finishedAt?: Date;
  resultUrl?: string;
  meta: {
    timeframe?: { from?: Date; to?: Date };
    policyId?: number;
    columns?: string[];
  };
  error?: string;
}

const exportJobsMemory = new Map<string, ExportJobData>();

// Generate export job ID
function generateExportJobId(): string {
  return `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Default columns for Final Attribution CSV
const DEFAULT_ATTRIBUTION_COLUMNS = [
  'stitch_id',
  'lead_created_at',
  'name',
  'phone',
  'email',
  'location',
  'final_channel',
  'final_source',
  'final_medium',
  'final_campaign',
  'first_touch_source',
  'last_touch_source',
  'paid_last_source',
  'revenue',
  'confidence',
];

// Default columns for Audit Trail CSV
const DEFAULT_AUDIT_COLUMNS = [
  'stitch_id',
  'source_file',
  'original_row_id',
  'matched_on',
  'match_pass',
  'reason',
];

// Generate Final Attribution CSV
async function generateAttributionCSV(
  accountId: number,
  timeframe?: { from?: Date; to?: Date },
  columns: string[] = DEFAULT_ATTRIBUTION_COLUMNS
): Promise<string> {
  let query = db
    .select()
    .from(stitchedLeads)
    .where(eq(stitchedLeads.accountId, accountId));

  // Apply timeframe filter
  if (timeframe?.from) {
    query = query.where(and(
      eq(stitchedLeads.accountId, accountId),
      gte(stitchedLeads.leadCreatedAt, timeframe.from)
    ));
  }

  if (timeframe?.to) {
    query = query.where(and(
      eq(stitchedLeads.accountId, accountId),
      lte(stitchedLeads.leadCreatedAt, timeframe.to)
    ));
  }

  const leads = await query.orderBy(stitchedLeads.leadCreatedAt);

  // Convert to CSV format
  const csvData = leads.map(lead => {
    const row: any = {};
    
    columns.forEach(column => {
      switch (column) {
        case 'stitch_id':
          row[column] = lead.stitchId;
          break;
        case 'lead_created_at':
          row[column] = lead.leadCreatedAt?.toISOString();
          break;
        case 'name':
          row[column] = lead.name || '';
          break;
        case 'phone':
          row[column] = lead.phone || '';
          break;
        case 'email':
          row[column] = lead.email || '';
          break;
        case 'location':
          row[column] = lead.location || '';
          break;
        case 'final_channel':
          row[column] = lead.finalChannel || '';
          break;
        case 'final_source':
          row[column] = lead.finalSource || '';
          break;
        case 'final_medium':
          row[column] = lead.finalMedium || '';
          break;
        case 'final_campaign':
          row[column] = lead.finalCampaign || '';
          break;
        case 'first_touch_source':
          row[column] = lead.firstTouchSource || '';
          break;
        case 'last_touch_source':
          row[column] = lead.lastTouchSource || '';
          break;
        case 'paid_last_source':
          row[column] = lead.paidLastSource || '';
          break;
        case 'revenue':
          row[column] = lead.revenue || 0;
          break;
        case 'confidence':
          row[column] = lead.confidence || 0;
          break;
        default:
          row[column] = '';
      }
    });

    return row;
  });

  return new Promise((resolve, reject) => {
    stringify(csvData, {
      header: true,
      columns: columns,
    }, (err, output) => {
      if (err) reject(err);
      else resolve(output);
    });
  });
}

// Generate Audit Trail CSV
async function generateAuditCSV(
  accountId: number,
  timeframe?: { from?: Date; to?: Date },
  columns: string[] = DEFAULT_AUDIT_COLUMNS
): Promise<string> {
  let query = db
    .select({
      stitchId: stitchedLeads.stitchId,
      sourceFile: auditTrail.sourceFile,
      originalRowId: auditTrail.originalRowId,
      matchedOn: auditTrail.matchedOn,
      matchPass: auditTrail.matchPass,
      reason: auditTrail.reason,
    })
    .from(auditTrail)
    .innerJoin(stitchedLeads, eq(auditTrail.stitchId, stitchedLeads.id))
    .where(eq(auditTrail.accountId, accountId));

  // Apply timeframe filter
  if (timeframe?.from || timeframe?.to) {
    const leadQuery = db
      .select({ id: stitchedLeads.id })
      .from(stitchedLeads)
      .where(eq(stitchedLeads.accountId, accountId));

    if (timeframe.from) {
      leadQuery.where(gte(stitchedLeads.leadCreatedAt, timeframe.from));
    }

    if (timeframe.to) {
      leadQuery.where(lte(stitchedLeads.leadCreatedAt, timeframe.to));
    }

    // This would need to be implemented with a subquery in production
  }

  const auditRecords = await query.orderBy(stitchedLeads.leadCreatedAt);

  // Convert to CSV format
  const csvData = auditRecords.map(record => {
    const row: any = {};
    
    columns.forEach(column => {
      switch (column) {
        case 'stitch_id':
          row[column] = record.stitchId;
          break;
        case 'source_file':
          row[column] = record.sourceFile || '';
          break;
        case 'original_row_id':
          row[column] = record.originalRowId || '';
          break;
        case 'matched_on':
          row[column] = JSON.stringify(record.matchedOn);
          break;
        case 'match_pass':
          row[column] = record.matchPass || '';
          break;
        case 'reason':
          row[column] = record.reason || '';
          break;
        default:
          row[column] = '';
      }
    });

    return row;
  });

  return new Promise((resolve, reject) => {
    stringify(csvData, {
      header: true,
      columns: columns,
    }, (err, output) => {
      if (err) reject(err);
      else resolve(output);
    });
  });
}

// Process export job
async function processExportJob(jobId: string): Promise<void> {
  const job = exportJobsMemory.get(jobId);
  if (!job) {
    logger.error('Export job not found', { jobId });
    return;
  }

  try {
    job.status = 'running';
    job.startedAt = new Date();

    logger.info('Starting export job', {
      jobId,
      accountId: job.accountId,
      meta: job.meta,
    });

    // Generate both CSV files
    const attributionCSV = await generateAttributionCSV(
      job.accountId,
      job.meta.timeframe,
      job.meta.columns
    );

    const auditCSV = await generateAuditCSV(
      job.accountId,
      job.meta.timeframe
    );

    // Save files (in production, use cloud storage)
    const exportDir = path.join(process.cwd(), 'exports');
    await fs.mkdir(exportDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const attributionFile = path.join(exportDir, `${jobId}_attribution_${timestamp}.csv`);
    const auditFile = path.join(exportDir, `${jobId}_audit_${timestamp}.csv`);

    await fs.writeFile(attributionFile, attributionCSV);
    await fs.writeFile(auditFile, auditCSV);

    job.status = 'completed';
    job.finishedAt = new Date();
    job.resultUrl = `/api/exports/${jobId}/download`;

    logger.info('Export job completed', {
      jobId,
      attributionFile,
      auditFile,
    });

  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.finishedAt = new Date();

    logger.error('Export job failed', {
      jobId,
      error: error.message,
      stack: error.stack,
    });
  }
}

// POST /api/exports
router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const { error, value } = exportSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const accountId = req.user!.accountId;
  const { timeframe, policyId, columns } = value;

  // Create export job
  const jobId = generateExportJobId();
  const job: ExportJobData = {
    id: jobId,
    accountId,
    status: 'queued',
    meta: {
      timeframe,
      policyId,
      columns: columns || DEFAULT_ATTRIBUTION_COLUMNS,
    },
  };

  exportJobsMemory.set(jobId, job);

  // Start processing asynchronously
  setImmediate(() => processExportJob(jobId));

  res.status(202).json({
    exportJobId: jobId,
    message: 'Export job queued successfully',
    status: 'queued',
  });
}));

// GET /api/exports/:id
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const jobId = req.params.id;
  const accountId = req.user!.accountId;

  const job = exportJobsMemory.get(jobId);
  if (!job || job.accountId !== accountId) {
    throw new NotFoundError('Export job not found');
  }

  const response: any = {
    exportJobId: job.id,
    status: job.status,
    meta: job.meta,
  };

  if (job.startedAt) {
    response.startedAt = job.startedAt;
  }

  if (job.finishedAt) {
    response.finishedAt = job.finishedAt;
  }

  if (job.status === 'completed' && job.resultUrl) {
    response.downloadUrl = job.resultUrl;
  }

  if (job.status === 'failed' && job.error) {
    response.error = job.error;
  }

  res.json(response);
}));

// GET /api/exports/:id/download
router.get('/:id/download', authenticateToken, asyncHandler(async (req, res) => {
  const jobId = req.params.id;
  const accountId = req.user!.accountId;
  const fileType = req.query.type as string || 'attribution'; // 'attribution' or 'audit'

  const job = exportJobsMemory.get(jobId);
  if (!job || job.accountId !== accountId) {
    throw new NotFoundError('Export job not found');
  }

  if (job.status !== 'completed') {
    throw new ValidationError('Export job not completed');
  }

  // Find the file
  const exportDir = path.join(process.cwd(), 'exports');
  const files = await fs.readdir(exportDir);
  
  const filePattern = fileType === 'audit' 
    ? new RegExp(`${jobId}_audit_.*\\.csv$`)
    : new RegExp(`${jobId}_attribution_.*\\.csv$`);
  
  const fileName = files.find(file => filePattern.test(file));
  
  if (!fileName) {
    throw new NotFoundError('Export file not found');
  }

  const filePath = path.join(exportDir, fileName);
  
  // Set headers for download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  // Stream the file
  const fileContent = await fs.readFile(filePath);
  res.send(fileContent);

  logger.info('Export file downloaded', {
    jobId,
    fileName,
    accountId,
  });
}));

// GET /api/exports
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const accountId = req.user!.accountId;
  const limit = parseInt(req.query.limit as string) || 20;

  // Filter jobs for this account
  const accountJobs = Array.from(exportJobsMemory.values())
    .filter(job => job.accountId === accountId)
    .sort((a, b) => (b.startedAt || new Date(0)).getTime() - (a.startedAt || new Date(0)).getTime())
    .slice(0, limit);

  const jobList = accountJobs.map(job => ({
    exportJobId: job.id,
    status: job.status,
    meta: job.meta,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    downloadUrl: job.status === 'completed' ? job.resultUrl : undefined,
    error: job.status === 'failed' ? job.error : undefined,
  }));

  res.json({
    exports: jobList,
    total: accountJobs.length,
  });
}));

export default router;

