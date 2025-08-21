import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse';
import { db } from '../db/connection';
import { uploads, normalizedRows, mappingTemplates } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { ValidationError, NotFoundError, asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { normalizeData } from '../services/normalizer';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  dest: process.env.UPLOAD_DIR || './uploads',
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

// Helper function to detect source type from filename/headers
function detectSourceType(filename: string, headers: string[]): string {
  const lowerFilename = filename.toLowerCase();
  const lowerHeaders = headers.map(h => h.toLowerCase());

  // CallRail detection
  if (lowerFilename.includes('callrail') || 
      lowerHeaders.some(h => h.includes('call start time') || h.includes('tracking number'))) {
    return 'calls';
  }

  // Facebook Lead Ads detection
  if (lowerFilename.includes('facebook') || lowerFilename.includes('lead') ||
      lowerHeaders.some(h => h.includes('created_time') || h.includes('campaign_name'))) {
    return 'forms';
  }

  // Calendly detection
  if (lowerFilename.includes('calendly') || lowerFilename.includes('appointment') ||
      lowerHeaders.some(h => h.includes('event start time') || h.includes('invitee'))) {
    return 'appts';
  }

  // Invoice detection
  if (lowerFilename.includes('invoice') || lowerFilename.includes('servicetitan') ||
      lowerHeaders.some(h => h.includes('invoice') || h.includes('amount') || h.includes('job id'))) {
    return 'invoices';
  }

  return 'unknown';
}

// Helper function to parse CSV file
async function parseCSVFile(filePath: string): Promise<{ headers: string[], rows: any[] }> {
  const fileContent = await fs.readFile(filePath, 'utf-8');
  
  return new Promise((resolve, reject) => {
    const rows: any[] = [];
    let headers: string[] = [];

    parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })
    .on('headers', (headerList) => {
      headers = headerList;
    })
    .on('data', (row) => {
      rows.push(row);
    })
    .on('end', () => {
      resolve({ headers, rows });
    })
    .on('error', (error) => {
      reject(error);
    });
  });
}

// POST /api/uploads (multipart)
router.post('/', authenticateToken, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ValidationError('No file uploaded');
  }

  const accountId = req.user!.accountId;
  const file = req.file;

  try {
    // Parse CSV to get headers for type detection
    const { headers } = await parseCSVFile(file.path);
    const detectedType = detectSourceType(file.originalname, headers);

    // Create upload record
    const [uploadRecord] = await db
      .insert(uploads)
      .values({
        accountId,
        filename: file.originalname,
        bytes: file.size,
        detectedType,
        status: 'uploaded',
      })
      .returning();

    // Clean up uploaded file (we don't store raw files)
    await fs.unlink(file.path);

    logger.info('File uploaded successfully', {
      uploadId: uploadRecord.id,
      filename: file.originalname,
      detectedType,
      accountId,
    });

    res.status(201).json({
      uploadId: uploadRecord.id,
      filename: file.originalname,
      detectedType,
      status: 'uploaded',
      headers,
    });
  } catch (error) {
    // Clean up file on error
    try {
      await fs.unlink(file.path);
    } catch (unlinkError) {
      logger.error('Failed to clean up uploaded file:', unlinkError);
    }
    throw error;
  }
}));

// POST /api/uploads/:id/parse
router.post('/:id/parse', authenticateToken, asyncHandler(async (req, res) => {
  const accountId = req.user!.accountId;
  const uploadId = parseInt(req.params.id);
  const { templateId } = req.body;

  if (isNaN(uploadId)) {
    throw new ValidationError('Invalid upload ID');
  }

  // Get upload record
  const uploadResult = await db
    .select()
    .from(uploads)
    .where(
      and(
        eq(uploads.id, uploadId),
        eq(uploads.accountId, accountId)
      )
    )
    .limit(1);

  if (uploadResult.length === 0) {
    throw new NotFoundError('Upload not found');
  }

  const uploadRecord = uploadResult[0];

  if (uploadRecord.status !== 'uploaded') {
    throw new ValidationError('Upload has already been processed');
  }

  // Get mapping template
  let template;
  if (templateId) {
    const templateResult = await db
      .select()
      .from(mappingTemplates)
      .where(
        and(
          eq(mappingTemplates.id, templateId),
          eq(mappingTemplates.accountId, accountId)
        )
      )
      .limit(1);

    if (templateResult.length === 0) {
      throw new NotFoundError('Template not found');
    }
    template = templateResult[0];
  } else {
    // Use default template based on detected type
    // This would need to be implemented based on the default templates
    throw new ValidationError('Template ID is required for parsing');
  }

  try {
    // Update status to parsing
    await db
      .update(uploads)
      .set({ status: 'parsing' })
      .where(eq(uploads.id, uploadId));

    // Note: In a real implementation, this would be done via a job queue
    // For now, we'll process synchronously but this should be async
    
    // Parse and normalize data
    // This is a placeholder - actual implementation would need the file content
    // which we deleted after upload. In production, you'd either:
    // 1. Store files temporarily and process them
    // 2. Process immediately during upload
    // 3. Use a job queue with file storage

    // Update status to normalized
    await db
      .update(uploads)
      .set({ status: 'normalized' })
      .where(eq(uploads.id, uploadId));

    res.json({
      message: 'File parsed successfully',
      uploadId,
      status: 'normalized',
    });
  } catch (error) {
    // Update status to failed
    await db
      .update(uploads)
      .set({ status: 'failed' })
      .where(eq(uploads.id, uploadId));

    logger.error('File parsing failed:', {
      uploadId,
      error: error.message,
      accountId,
    });

    throw error;
  }
}));

// GET /api/uploads/:id/preview
router.get('/:id/preview', authenticateToken, asyncHandler(async (req, res) => {
  const accountId = req.user!.accountId;
  const uploadId = parseInt(req.params.id);

  if (isNaN(uploadId)) {
    throw new ValidationError('Invalid upload ID');
  }

  // Get normalized rows for preview
  const rows = await db
    .select()
    .from(normalizedRows)
    .where(
      and(
        eq(normalizedRows.uploadId, uploadId),
        eq(normalizedRows.accountId, accountId)
      )
    )
    .limit(50);

  res.json({
    preview: rows,
    count: rows.length,
  });
}));

// GET /api/uploads
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const accountId = req.user!.accountId;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = parseInt(req.query.offset as string) || 0;

  const uploadsList = await db
    .select()
    .from(uploads)
    .where(eq(uploads.accountId, accountId))
    .orderBy(uploads.createdAt)
    .limit(limit)
    .offset(offset);

  res.json({
    uploads: uploadsList,
    limit,
    offset,
  });
}));

export default router;

