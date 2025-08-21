import { Router } from 'express';
import { db } from '../db/connection';
import { uploads, policies } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { ValidationError, NotFoundError, asyncHandler } from '../middleware/errorHandler';
import { runMatch } from '../services/matcher';
import { logger } from '../utils/logger';
import Joi from 'joi';

const router = Router();

// In-memory job storage (in production, use Redis or database)
interface MatchJob {
  id: string;
  accountId: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  uploadIds: number[];
  policyId?: number;
  result?: {
    stitchedNew: number;
    linksCreated: number;
    errors: string[];
  };
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

const jobs = new Map<string, MatchJob>();

// Validation schema
const matchRunSchema = Joi.object({
  uploadIds: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
  policyId: Joi.number().integer().positive().optional(),
});

// Generate job ID
function generateJobId(): string {
  return `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get default policy YAML
function getDefaultPolicyYaml(): string {
  return `
name: "Default Paid-Last"
attribution_mode: "paid_last"
windows:
  phone_exact: 30
  email_exact: 30
  click_chain: 7
  fuzzy_match: 1
weights:
  phone_exact: 1.0
  email_exact: 0.9
  click_chain: 0.7
  fuzzy_match: 0.5
tie_breakers:
  - "latest_event_time"
  - "longer_call_duration"
confidence_rules:
  two_deterministic: 1.0
  one_deterministic: 0.9
  click_only: 0.7
  fuzzy_only: 0.5
`.trim();
}

// Process match job (async)
async function processMatchJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) {
    logger.error('Job not found', { jobId });
    return;
  }

  try {
    job.status = 'running';
    job.startedAt = new Date();
    job.progress = 10;

    logger.info('Starting match job', {
      jobId,
      accountId: job.accountId,
      uploadIds: job.uploadIds,
    });

    // Get policy YAML
    let policyYaml = getDefaultPolicyYaml();
    
    if (job.policyId) {
      const policyResult = await db
        .select()
        .from(policies)
        .where(
          and(
            eq(policies.id, job.policyId),
            eq(policies.accountId, job.accountId)
          )
        )
        .limit(1);

      if (policyResult.length > 0) {
        policyYaml = policyResult[0].yaml;
      }
    }

    job.progress = 20;

    // Run the matching process
    const result = await runMatch(job.accountId, job.uploadIds, policyYaml);

    job.progress = 90;

    // Update upload statuses
    await db
      .update(uploads)
      .set({ status: 'matched' })
      .where(
        and(
          eq(uploads.accountId, job.accountId),
          inArray(uploads.id, job.uploadIds)
        )
      );

    job.progress = 100;
    job.status = 'completed';
    job.result = result;
    job.completedAt = new Date();

    logger.info('Match job completed', {
      jobId,
      result,
    });

  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.completedAt = new Date();

    logger.error('Match job failed', {
      jobId,
      error: error.message,
      stack: error.stack,
    });

    // Update upload statuses to failed
    try {
      await db
        .update(uploads)
        .set({ status: 'failed' })
        .where(
          and(
            eq(uploads.accountId, job.accountId),
            inArray(uploads.id, job.uploadIds)
          )
        );
    } catch (updateError) {
      logger.error('Failed to update upload status', { jobId, updateError });
    }
  }
}

// POST /api/match/run
router.post('/run', authenticateToken, asyncHandler(async (req, res) => {
  const { error, value } = matchRunSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const accountId = req.user!.accountId;
  const { uploadIds, policyId } = value;

  // Validate uploads exist and belong to account
  const uploadsResult = await db
    .select()
    .from(uploads)
    .where(
      and(
        eq(uploads.accountId, accountId),
        inArray(uploads.id, uploadIds)
      )
    );

  if (uploadsResult.length !== uploadIds.length) {
    throw new NotFoundError('One or more uploads not found');
  }

  // Check if uploads are in correct status
  const invalidUploads = uploadsResult.filter(upload => 
    !['normalized', 'matched'].includes(upload.status)
  );

  if (invalidUploads.length > 0) {
    throw new ValidationError(
      `Uploads must be normalized before matching. Invalid uploads: ${invalidUploads.map(u => u.id).join(', ')}`
    );
  }

  // Validate policy if provided
  if (policyId) {
    const policyResult = await db
      .select()
      .from(policies)
      .where(
        and(
          eq(policies.id, policyId),
          eq(policies.accountId, accountId)
        )
      )
      .limit(1);

    if (policyResult.length === 0) {
      throw new NotFoundError('Policy not found');
    }
  }

  // Create job
  const jobId = generateJobId();
  const job: MatchJob = {
    id: jobId,
    accountId,
    status: 'queued',
    progress: 0,
    uploadIds,
    policyId,
  };

  jobs.set(jobId, job);

  // Start processing asynchronously
  setImmediate(() => processMatchJob(jobId));

  res.status(202).json({
    jobId,
    message: 'Match job queued successfully',
    status: 'queued',
  });
}));

// GET /api/match/status/:jobId
router.get('/status/:jobId', authenticateToken, asyncHandler(async (req, res) => {
  const jobId = req.params.jobId;
  const accountId = req.user!.accountId;

  const job = jobs.get(jobId);
  if (!job || job.accountId !== accountId) {
    throw new NotFoundError('Job not found');
  }

  const response: any = {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    uploadIds: job.uploadIds,
  };

  if (job.startedAt) {
    response.startedAt = job.startedAt;
  }

  if (job.completedAt) {
    response.completedAt = job.completedAt;
  }

  if (job.status === 'completed' && job.result) {
    response.result = {
      stitchedNew: job.result.stitchedNew,
      linksCreated: job.result.linksCreated,
      errorCount: job.result.errors.length,
    };
  }

  if (job.status === 'failed' && job.error) {
    response.error = job.error;
  }

  res.json(response);
}));

// GET /api/match/jobs
router.get('/jobs', authenticateToken, asyncHandler(async (req, res) => {
  const accountId = req.user!.accountId;
  const limit = parseInt(req.query.limit as string) || 20;

  // Filter jobs for this account
  const accountJobs = Array.from(jobs.values())
    .filter(job => job.accountId === accountId)
    .sort((a, b) => (b.startedAt || new Date(0)).getTime() - (a.startedAt || new Date(0)).getTime())
    .slice(0, limit);

  const jobList = accountJobs.map(job => ({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    uploadIds: job.uploadIds,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    result: job.status === 'completed' ? {
      stitchedNew: job.result?.stitchedNew || 0,
      linksCreated: job.result?.linksCreated || 0,
      errorCount: job.result?.errors.length || 0,
    } : undefined,
    error: job.status === 'failed' ? job.error : undefined,
  }));

  res.json({
    jobs: jobList,
    total: accountJobs.length,
  });
}));

// DELETE /api/match/jobs/:jobId
router.delete('/jobs/:jobId', authenticateToken, asyncHandler(async (req, res) => {
  const jobId = req.params.jobId;
  const accountId = req.user!.accountId;

  const job = jobs.get(jobId);
  if (!job || job.accountId !== accountId) {
    throw new NotFoundError('Job not found');
  }

  if (job.status === 'running') {
    throw new ValidationError('Cannot delete running job');
  }

  jobs.delete(jobId);

  res.json({
    message: 'Job deleted successfully',
  });
}));

export default router;

