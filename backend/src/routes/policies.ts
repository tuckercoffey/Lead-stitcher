import { Router } from 'express';
import { db } from '../db/connection';
import { policies } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { ValidationError, NotFoundError, asyncHandler } from '../middleware/errorHandler';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import Joi from 'joi';

const router = Router();

// Validation schema for policy
const policySchema = Joi.object({
  name: Joi.string().min(1).max(120).required(),
  yaml: Joi.string().required(),
  isDefault: Joi.boolean().default(false),
});

// Default policy templates
const defaultPolicies = {
  paid_last_roofing: `
name: "Paid-Last Roofing Default"
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
  - "higher_revenue"
confidence_rules:
  two_deterministic: 1.0
  one_deterministic: 0.9
  click_only: 0.7
  fuzzy_only: 0.5
`,
  first_touch_pi_law: `
name: "First-Touch PI Law"
attribution_mode: "first_touch"
windows:
  phone_exact: 60
  email_exact: 60
  click_chain: 14
  fuzzy_match: 3
weights:
  phone_exact: 1.0
  email_exact: 0.95
  click_chain: 0.8
  fuzzy_match: 0.6
tie_breakers:
  - "earliest_event_time"
  - "form_over_call"
confidence_rules:
  two_deterministic: 1.0
  one_deterministic: 0.95
  click_only: 0.8
  fuzzy_only: 0.6
`,
  dental_equal_weight: `
name: "Dental Equal Weight"
attribution_mode: "equal_weight"
windows:
  phone_exact: 14
  email_exact: 14
  click_chain: 3
  fuzzy_match: 1
weights:
  phone_exact: 1.0
  email_exact: 1.0
  click_chain: 0.8
  fuzzy_match: 0.4
tie_breakers:
  - "appointment_over_call"
  - "latest_event_time"
confidence_rules:
  two_deterministic: 1.0
  one_deterministic: 0.9
  click_only: 0.7
  fuzzy_only: 0.4
`,
  auto_call_first: `
name: "Auto Call-First"
attribution_mode: "call_first"
windows:
  phone_exact: 21
  email_exact: 21
  click_chain: 5
  fuzzy_match: 1
weights:
  phone_exact: 1.0
  email_exact: 0.85
  click_chain: 0.75
  fuzzy_match: 0.5
tie_breakers:
  - "call_over_form"
  - "longer_call_duration"
  - "latest_event_time"
confidence_rules:
  two_deterministic: 1.0
  one_deterministic: 0.85
  click_only: 0.75
  fuzzy_only: 0.5
`,
};

// Validate YAML policy structure
function validatePolicyYaml(yamlString: string): any {
  try {
    const policy = parseYaml(yamlString);
    
    // Basic structure validation
    if (!policy.name || typeof policy.name !== 'string') {
      throw new Error('Policy must have a name');
    }
    
    if (!policy.attribution_mode || !['paid_last', 'first_touch', 'last_touch', 'call_first', 'equal_weight'].includes(policy.attribution_mode)) {
      throw new Error('Policy must have a valid attribution_mode');
    }
    
    if (!policy.windows || typeof policy.windows !== 'object') {
      throw new Error('Policy must have windows configuration');
    }
    
    if (!policy.weights || typeof policy.weights !== 'object') {
      throw new Error('Policy must have weights configuration');
    }
    
    return policy;
  } catch (error) {
    throw new ValidationError(`Invalid YAML policy: ${error.message}`);
  }
}

// GET /api/policies
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const accountId = req.user!.accountId;

  const userPolicies = await db
    .select()
    .from(policies)
    .where(eq(policies.accountId, accountId))
    .orderBy(policies.createdAt);

  // Include default policies
  const defaultPolicyList = Object.entries(defaultPolicies).map(([key, yaml], index) => ({
    id: `default_${key}`,
    name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    yaml: yaml.trim(),
    isDefault: true,
    createdAt: new Date().toISOString(),
  }));

  res.json({
    policies: [...defaultPolicyList, ...userPolicies],
  });
}));

// POST /api/policies
router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const { error, value } = policySchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const accountId = req.user!.accountId;
  const { name, yaml, isDefault } = value;

  // Validate YAML structure
  validatePolicyYaml(yaml);

  // Check if policy with same name exists
  const existing = await db
    .select()
    .from(policies)
    .where(
      and(
        eq(policies.accountId, accountId),
        eq(policies.name, name)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    throw new ValidationError('Policy with this name already exists');
  }

  const [policy] = await db
    .insert(policies)
    .values({
      accountId,
      name,
      yaml,
      isDefault,
    })
    .returning();

  res.status(201).json({
    message: 'Policy created successfully',
    policy,
  });
}));

// PUT /api/policies/:id
router.put('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { error, value } = policySchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const accountId = req.user!.accountId;
  const policyId = parseInt(req.params.id);
  const { name, yaml, isDefault } = value;

  if (isNaN(policyId)) {
    throw new ValidationError('Invalid policy ID');
  }

  // Validate YAML structure
  validatePolicyYaml(yaml);

  // Check if policy exists and belongs to account
  const existing = await db
    .select()
    .from(policies)
    .where(
      and(
        eq(policies.id, policyId),
        eq(policies.accountId, accountId)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError('Policy not found');
  }

  const [policy] = await db
    .update(policies)
    .set({
      name,
      yaml,
      isDefault,
    })
    .where(
      and(
        eq(policies.id, policyId),
        eq(policies.accountId, accountId)
      )
    )
    .returning();

  res.json({
    message: 'Policy updated successfully',
    policy,
  });
}));

// DELETE /api/policies/:id
router.delete('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const accountId = req.user!.accountId;
  const policyId = parseInt(req.params.id);

  if (isNaN(policyId)) {
    throw new ValidationError('Invalid policy ID');
  }

  const result = await db
    .delete(policies)
    .where(
      and(
        eq(policies.id, policyId),
        eq(policies.accountId, accountId)
      )
    )
    .returning();

  if (result.length === 0) {
    throw new NotFoundError('Policy not found');
  }

  res.json({
    message: 'Policy deleted successfully',
  });
}));

// GET /api/policies/defaults
router.get('/defaults', (req, res) => {
  const defaultPolicyList = Object.entries(defaultPolicies).map(([key, yaml]) => ({
    id: `default_${key}`,
    name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    yaml: yaml.trim(),
    isDefault: true,
  }));

  res.json({
    policies: defaultPolicyList,
  });
});

// GET /api/policies/:id/validate
router.get('/:id/validate', authenticateToken, asyncHandler(async (req, res) => {
  const accountId = req.user!.accountId;
  const policyId = req.params.id;

  let policyYaml: string;

  if (policyId.startsWith('default_')) {
    const key = policyId.replace('default_', '');
    policyYaml = defaultPolicies[key as keyof typeof defaultPolicies];
    if (!policyYaml) {
      throw new NotFoundError('Default policy not found');
    }
  } else {
    const id = parseInt(policyId);
    if (isNaN(id)) {
      throw new ValidationError('Invalid policy ID');
    }

    const policyResult = await db
      .select()
      .from(policies)
      .where(
        and(
          eq(policies.id, id),
          eq(policies.accountId, accountId)
        )
      )
      .limit(1);

    if (policyResult.length === 0) {
      throw new NotFoundError('Policy not found');
    }

    policyYaml = policyResult[0].yaml;
  }

  try {
    const parsed = validatePolicyYaml(policyYaml);
    res.json({
      valid: true,
      parsed,
    });
  } catch (error) {
    res.json({
      valid: false,
      error: error.message,
    });
  }
}));

export default router;

