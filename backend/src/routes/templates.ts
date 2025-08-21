import { Router } from 'express';
import { db } from '../db/connection';
import { mappingTemplates } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { ValidationError, NotFoundError, asyncHandler } from '../middleware/errorHandler';
import Joi from 'joi';

const router = Router();

// Validation schemas
const templateSchema = Joi.object({
  name: Joi.string().min(1).max(120).required(),
  sourceType: Joi.string().valid('calls', 'forms', 'chats', 'appts', 'invoices').required(),
  columnMap: Joi.object().pattern(
    Joi.string(),
    Joi.string().valid(
      'occurred_at', 'name', 'phone', 'email', 'gclid', 'client_id',
      'utm_source', 'utm_medium', 'utm_campaign', 'landing_page',
      'location', 'duration_sec', 'amount', 'external_id'
    )
  ).required(),
});

// Default templates
const defaultTemplates = [
  {
    name: 'CallRail Standard',
    sourceType: 'calls',
    columnMap: {
      'Call Start Time': 'occurred_at',
      'Customer Phone Number': 'phone',
      'Tracking Number': 'location',
      'Call Duration (sec)': 'duration_sec',
      'Source': 'utm_source',
      'Medium': 'utm_medium',
      'Campaign': 'utm_campaign',
      'Landing Page': 'landing_page',
      'GCLID': 'gclid',
    },
  },
  {
    name: 'Facebook Lead Ads',
    sourceType: 'forms',
    columnMap: {
      'created_time': 'occurred_at',
      'full_name': 'name',
      'email': 'email',
      'phone_number': 'phone',
      'campaign_name': 'utm_campaign',
      'adset_name': 'utm_medium',
      'platform': 'utm_source',
    },
  },
  {
    name: 'Calendly Appointments',
    sourceType: 'appts',
    columnMap: {
      'Event Start Time': 'occurred_at',
      'Invitee Email': 'email',
      'Invitee Name': 'name',
      'Invitee Phone Number': 'phone',
      'Location': 'location',
    },
  },
  {
    name: 'ServiceTitan Invoices',
    sourceType: 'invoices',
    columnMap: {
      'Invoice Date': 'occurred_at',
      'Customer Name': 'name',
      'Phone': 'phone',
      'Email': 'email',
      'Location': 'location',
      'Invoice Amount': 'amount',
      'Job ID': 'external_id',
    },
  },
];

// GET /api/templates
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const accountId = req.user!.accountId;

  const templates = await db
    .select()
    .from(mappingTemplates)
    .where(eq(mappingTemplates.accountId, accountId))
    .orderBy(mappingTemplates.createdAt);

  // If no templates exist, return defaults
  if (templates.length === 0) {
    return res.json({
      templates: defaultTemplates.map((template, index) => ({
        id: `default_${index}`,
        ...template,
        isDefault: true,
        createdAt: new Date().toISOString(),
      })),
    });
  }

  res.json({
    templates: templates.map(template => ({
      ...template,
      isDefault: false,
    })),
  });
}));

// POST /api/templates
router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const { error, value } = templateSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const accountId = req.user!.accountId;
  const { name, sourceType, columnMap } = value;

  // Check if template with same name exists
  const existing = await db
    .select()
    .from(mappingTemplates)
    .where(
      and(
        eq(mappingTemplates.accountId, accountId),
        eq(mappingTemplates.name, name)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    throw new ValidationError('Template with this name already exists');
  }

  const [template] = await db
    .insert(mappingTemplates)
    .values({
      accountId,
      name,
      sourceType,
      columnMap,
    })
    .returning();

  res.status(201).json({
    message: 'Template created successfully',
    template,
  });
}));

// PUT /api/templates/:id
router.put('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { error, value } = templateSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const accountId = req.user!.accountId;
  const templateId = parseInt(req.params.id);
  const { name, sourceType, columnMap } = value;

  if (isNaN(templateId)) {
    throw new ValidationError('Invalid template ID');
  }

  // Check if template exists and belongs to account
  const existing = await db
    .select()
    .from(mappingTemplates)
    .where(
      and(
        eq(mappingTemplates.id, templateId),
        eq(mappingTemplates.accountId, accountId)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError('Template not found');
  }

  const [template] = await db
    .update(mappingTemplates)
    .set({
      name,
      sourceType,
      columnMap,
    })
    .where(
      and(
        eq(mappingTemplates.id, templateId),
        eq(mappingTemplates.accountId, accountId)
      )
    )
    .returning();

  res.json({
    message: 'Template updated successfully',
    template,
  });
}));

// DELETE /api/templates/:id
router.delete('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const accountId = req.user!.accountId;
  const templateId = parseInt(req.params.id);

  if (isNaN(templateId)) {
    throw new ValidationError('Invalid template ID');
  }

  const result = await db
    .delete(mappingTemplates)
    .where(
      and(
        eq(mappingTemplates.id, templateId),
        eq(mappingTemplates.accountId, accountId)
      )
    )
    .returning();

  if (result.length === 0) {
    throw new NotFoundError('Template not found');
  }

  res.json({
    message: 'Template deleted successfully',
  });
}));

// GET /api/templates/defaults
router.get('/defaults', (req, res) => {
  res.json({
    templates: defaultTemplates,
  });
});

export default router;

