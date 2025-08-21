import { db } from '../db/connection';
import { normalizedRows, stitchedLeads, stitchLinks, auditTrail, usageCounters } from '../db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { parse as parseYaml } from 'yaml';
import { ulid } from 'ulid';
import { distance as jaroWinkler } from 'natural';
import { UsageLimitError } from '../middleware/errorHandler';

export interface NormRow {
  id: number;
  accountId: number;
  uploadId: number;
  sourceType: string;
  occurredAt: Date;
  name?: string;
  phone?: string;
  email?: string;
  gclid?: string;
  clientId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  landingPage?: string;
  location?: string;
  durationSec?: number;
  amount?: number;
  externalId?: string;
  original: any;
}

export interface PolicyConfig {
  name: string;
  attribution_mode: 'paid_last' | 'first_touch' | 'last_touch' | 'call_first' | 'equal_weight';
  windows: {
    phone_exact: number;
    email_exact: number;
    click_chain: number;
    fuzzy_match: number;
  };
  weights: {
    phone_exact: number;
    email_exact: number;
    click_chain: number;
    fuzzy_match: number;
  };
  tie_breakers: string[];
  confidence_rules: {
    two_deterministic: number;
    one_deterministic: number;
    click_only: number;
    fuzzy_only: number;
  };
}

export interface MatchCandidate {
  stitchId: number;
  weight: number;
  pass: string;
  matchedOn: string[];
  reason: string;
  confidence: number;
}

export interface MatchResult {
  stitchedNew: number;
  linksCreated: number;
  errors: string[];
}

// Generate matching keys for a row
function generateMatchingKeys(row: NormRow): Map<string, string> {
  const keys = new Map<string, string>();

  if (row.phone) {
    keys.set('phone', row.phone);
  }

  if (row.email) {
    keys.set('email', row.email);
  }

  if (row.gclid) {
    keys.set('gclid', row.gclid);
  }

  if (row.clientId) {
    keys.set('client_id', row.clientId);
  }

  // Generate fuzzy key for name + location
  if (row.name && row.location) {
    const fuzzyKey = `${row.name.toLowerCase().trim()}_${row.location.toLowerCase().trim()}`;
    keys.set('fuzzy', fuzzyKey);
  }

  return keys;
}

// Check if two dates are within a window
function isWithinWindow(date1: Date, date2: Date, windowDays: number): boolean {
  const diffMs = Math.abs(date1.getTime() - date2.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= windowDays;
}

// Calculate Jaro-Winkler similarity
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  return jaroWinkler(str1.toLowerCase(), str2.toLowerCase());
}

// Find existing stitches that match a row
async function findMatchingStitches(
  row: NormRow,
  policy: PolicyConfig,
  accountId: number
): Promise<MatchCandidate[]> {
  const candidates: MatchCandidate[] = [];
  const keys = generateMatchingKeys(row);

  // P1: Phone exact match within window
  if (keys.has('phone')) {
    const phoneMatches = await db
      .select({
        stitchId: stitchedLeads.id,
        phone: stitchedLeads.phone,
        leadCreatedAt: stitchedLeads.leadCreatedAt,
      })
      .from(stitchedLeads)
      .where(
        and(
          eq(stitchedLeads.accountId, accountId),
          eq(stitchedLeads.phone, keys.get('phone')!)
        )
      );

    for (const match of phoneMatches) {
      if (isWithinWindow(row.occurredAt, match.leadCreatedAt, policy.windows.phone_exact)) {
        candidates.push({
          stitchId: match.stitchId,
          weight: policy.weights.phone_exact,
          pass: 'P1',
          matchedOn: ['phone'],
          reason: `Phone exact match: ${keys.get('phone')}`,
          confidence: policy.confidence_rules.one_deterministic,
        });
      }
    }
  }

  // P2: Email exact match within window
  if (keys.has('email')) {
    const emailMatches = await db
      .select({
        stitchId: stitchedLeads.id,
        email: stitchedLeads.email,
        leadCreatedAt: stitchedLeads.leadCreatedAt,
      })
      .from(stitchedLeads)
      .where(
        and(
          eq(stitchedLeads.accountId, accountId),
          eq(stitchedLeads.email, keys.get('email')!)
        )
      );

    for (const match of emailMatches) {
      if (isWithinWindow(row.occurredAt, match.leadCreatedAt, policy.windows.email_exact)) {
        candidates.push({
          stitchId: match.stitchId,
          weight: policy.weights.email_exact,
          pass: 'P2',
          matchedOn: ['email'],
          reason: `Email exact match: ${keys.get('email')}`,
          confidence: policy.confidence_rules.one_deterministic,
        });
      }
    }
  }

  // P3: Click chain match (gclid or client_id)
  const clickKey = keys.get('gclid') || keys.get('client_id');
  if (clickKey) {
    // Find normalized rows with same click ID within window
    const clickMatches = await db
      .select({
        stitchId: stitchLinks.stitchId,
        occurredAt: normalizedRows.occurredAt,
      })
      .from(normalizedRows)
      .innerJoin(stitchLinks, eq(normalizedRows.id, stitchLinks.normalizedRowId))
      .where(
        and(
          eq(normalizedRows.accountId, accountId),
          keys.has('gclid') 
            ? eq(normalizedRows.gclid, clickKey)
            : eq(normalizedRows.clientId, clickKey)
        )
      );

    for (const match of clickMatches) {
      if (isWithinWindow(row.occurredAt, match.occurredAt, policy.windows.click_chain)) {
        candidates.push({
          stitchId: match.stitchId,
          weight: policy.weights.click_chain,
          pass: 'P3',
          matchedOn: [keys.has('gclid') ? 'gclid' : 'client_id'],
          reason: `Click chain match: ${clickKey}`,
          confidence: policy.confidence_rules.click_only,
        });
      }
    }
  }

  // P4: Fuzzy match (name + location + similar time)
  if (keys.has('fuzzy') && row.name && row.location) {
    const fuzzyMatches = await db
      .select({
        stitchId: stitchedLeads.id,
        name: stitchedLeads.name,
        location: stitchedLeads.location,
        phone: stitchedLeads.phone,
        leadCreatedAt: stitchedLeads.leadCreatedAt,
      })
      .from(stitchedLeads)
      .where(
        and(
          eq(stitchedLeads.accountId, accountId),
          sql`${stitchedLeads.name} IS NOT NULL`,
          sql`${stitchedLeads.location} IS NOT NULL`
        )
      );

    for (const match of fuzzyMatches) {
      if (!match.name || !match.location) continue;

      // Check time window (±1 day for fuzzy)
      if (!isWithinWindow(row.occurredAt, match.leadCreatedAt, policy.windows.fuzzy_match)) {
        continue;
      }

      // Calculate name similarity
      const nameSimilarity = calculateSimilarity(row.name, match.name);
      if (nameSimilarity < 0.88) continue; // Jaro-Winkler threshold

      // Check location match
      const locationMatch = row.location.toLowerCase().includes(match.location.toLowerCase()) ||
                           match.location.toLowerCase().includes(row.location.toLowerCase());
      if (!locationMatch) continue;

      // Check phone Hamming distance if both have phones
      let phoneMatch = true;
      if (row.phone && match.phone) {
        const hammingDistance = calculateHammingDistance(row.phone, match.phone);
        phoneMatch = hammingDistance <= 1;
      }

      if (phoneMatch) {
        candidates.push({
          stitchId: match.stitchId,
          weight: policy.weights.fuzzy_match,
          pass: 'P4',
          matchedOn: ['name', 'location'],
          reason: `Fuzzy match: name similarity ${nameSimilarity.toFixed(2)}, location match`,
          confidence: policy.confidence_rules.fuzzy_only,
        });
      }
    }
  }

  return candidates;
}

// Calculate Hamming distance between two strings
function calculateHammingDistance(str1: string, str2: string): number {
  if (str1.length !== str2.length) {
    return Math.max(str1.length, str2.length);
  }

  let distance = 0;
  for (let i = 0; i < str1.length; i++) {
    if (str1[i] !== str2[i]) {
      distance++;
    }
  }
  return distance;
}

// Pick the best candidate based on policy tie breakers
function pickBestCandidate(candidates: MatchCandidate[], policy: PolicyConfig, row: NormRow): MatchCandidate | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Sort by weight first (highest first)
  candidates.sort((a, b) => b.weight - a.weight);

  // If weights are different, pick highest
  if (candidates[0].weight > candidates[1].weight) {
    return candidates[0];
  }

  // Apply tie breakers
  for (const tieBreaker of policy.tie_breakers) {
    switch (tieBreaker) {
      case 'latest_event_time':
        // Prefer more recent matches (this would need additional data)
        break;
      case 'longer_call_duration':
        if (row.sourceType === 'calls' && row.durationSec) {
          // Prefer longer calls (would need to compare with existing data)
        }
        break;
      case 'higher_revenue':
        if (row.amount) {
          // Prefer higher revenue (would need to compare with existing data)
        }
        break;
      case 'call_over_form':
        if (row.sourceType === 'calls') {
          return candidates[0];
        }
        break;
      case 'form_over_call':
        if (row.sourceType === 'forms') {
          return candidates[0];
        }
        break;
    }
  }

  // Default to first candidate
  return candidates[0];
}

// Create a new stitched lead
async function createNewStitch(row: NormRow, accountId: number): Promise<number> {
  const stitchId = ulid();
  
  const [stitch] = await db
    .insert(stitchedLeads)
    .values({
      accountId,
      stitchId,
      leadCreatedAt: row.occurredAt,
      name: row.name,
      phone: row.phone,
      email: row.email,
      location: row.location,
      revenue: row.amount || 0,
      confidence: 1.0, // Will be recalculated
    })
    .returning();

  return stitch.id;
}

// Link a row to a stitch
async function linkRowToStitch(
  row: NormRow,
  stitchDbId: number,
  candidate: MatchCandidate | null
): Promise<void> {
  await db.insert(stitchLinks).values({
    accountId: row.accountId,
    stitchId: stitchDbId,
    normalizedRowId: row.id,
    matchPass: candidate?.pass || 'NEW',
    matchedOn: {
      keys: candidate?.matchedOn || [],
      windowDays: 0,
    },
    reason: candidate?.reason || 'New lead created',
  });

  // Create audit trail entry
  await db.insert(auditTrail).values({
    accountId: row.accountId,
    stitchId: stitchDbId,
    sourceFile: `upload_${row.uploadId}`,
    originalRowId: row.id,
    matchedOn: {
      keys: candidate?.matchedOn || [],
      windowDays: 0,
    },
    matchPass: candidate?.pass || 'NEW',
    reason: candidate?.reason || 'New lead created',
  });
}

// Recompute attribution for a stitch
async function recomputeAttribution(stitchDbId: number, policy: PolicyConfig): Promise<void> {
  // Get all linked rows for this stitch
  const linkedRows = await db
    .select({
      id: normalizedRows.id,
      sourceType: normalizedRows.sourceType,
      occurredAt: normalizedRows.occurredAt,
      utmSource: normalizedRows.utmSource,
      utmMedium: normalizedRows.utmMedium,
      utmCampaign: normalizedRows.utmCampaign,
      amount: normalizedRows.amount,
    })
    .from(normalizedRows)
    .innerJoin(stitchLinks, eq(normalizedRows.id, stitchLinks.normalizedRowId))
    .where(eq(stitchLinks.stitchId, stitchDbId))
    .orderBy(normalizedRows.occurredAt);

  if (linkedRows.length === 0) return;

  // Calculate attribution based on policy
  let finalSource = '';
  let finalMedium = '';
  let finalCampaign = '';
  let finalChannel = '';
  let firstTouchSource = '';
  let lastTouchSource = '';
  let paidLastSource = '';

  // First touch
  const firstRow = linkedRows[0];
  firstTouchSource = firstRow.utmSource || 'direct';

  // Last touch
  const lastRow = linkedRows[linkedRows.length - 1];
  lastTouchSource = lastRow.utmSource || 'direct';

  // Paid last (last paid source)
  for (let i = linkedRows.length - 1; i >= 0; i--) {
    const row = linkedRows[i];
    if (row.utmMedium && ['cpc', 'paid', 'ppc'].includes(row.utmMedium.toLowerCase())) {
      paidLastSource = row.utmSource || 'paid';
      break;
    }
  }

  // Apply attribution mode
  switch (policy.attribution_mode) {
    case 'first_touch':
      finalSource = firstTouchSource;
      finalMedium = firstRow.utmMedium || '';
      finalCampaign = firstRow.utmCampaign || '';
      break;
    case 'last_touch':
      finalSource = lastTouchSource;
      finalMedium = lastRow.utmMedium || '';
      finalCampaign = lastRow.utmCampaign || '';
      break;
    case 'paid_last':
      if (paidLastSource) {
        const paidRow = linkedRows.reverse().find(r => 
          r.utmSource === paidLastSource && 
          r.utmMedium && ['cpc', 'paid', 'ppc'].includes(r.utmMedium.toLowerCase())
        );
        if (paidRow) {
          finalSource = paidRow.utmSource || '';
          finalMedium = paidRow.utmMedium || '';
          finalCampaign = paidRow.utmCampaign || '';
        }
      } else {
        // Fall back to last touch
        finalSource = lastTouchSource;
        finalMedium = lastRow.utmMedium || '';
        finalCampaign = lastRow.utmCampaign || '';
      }
      break;
    case 'call_first':
      const callRow = linkedRows.find(r => r.sourceType === 'calls');
      if (callRow) {
        finalSource = callRow.utmSource || 'phone';
        finalMedium = callRow.utmMedium || 'call';
        finalCampaign = callRow.utmCampaign || '';
      } else {
        finalSource = lastTouchSource;
        finalMedium = lastRow.utmMedium || '';
        finalCampaign = lastRow.utmCampaign || '';
      }
      break;
  }

  // Determine channel
  if (finalMedium) {
    const medium = finalMedium.toLowerCase();
    if (['cpc', 'ppc', 'paid'].includes(medium)) {
      finalChannel = 'paid_search';
    } else if (['social', 'facebook', 'linkedin'].includes(medium)) {
      finalChannel = 'social';
    } else if (medium === 'email') {
      finalChannel = 'email';
    } else if (medium === 'organic') {
      finalChannel = 'organic_search';
    } else {
      finalChannel = 'other';
    }
  } else {
    finalChannel = 'direct';
  }

  // Calculate total revenue
  const totalRevenue = linkedRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  // Update stitch
  await db
    .update(stitchedLeads)
    .set({
      finalChannel,
      finalSource,
      finalMedium,
      finalCampaign,
      firstTouchSource,
      lastTouchSource,
      paidLastSource,
      revenue: totalRevenue,
    })
    .where(eq(stitchedLeads.id, stitchDbId));
}

// Check usage limits
async function checkUsageLimit(accountId: number): Promise<void> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const usage = await db
    .select()
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.accountId, accountId),
        gte(usageCounters.periodStart, startOfMonth),
        lte(usageCounters.periodEnd, endOfMonth)
      )
    )
    .limit(1);

  if (usage.length === 0) {
    throw new Error('Usage counter not found');
  }

  const currentUsage = usage[0];
  
  // This would need to check against the actual plan limit
  // For now, using a placeholder limit
  const limit = 250; // This should come from the subscription/plan
  
  if (currentUsage.stitchedCount >= limit) {
    throw new UsageLimitError(`Monthly limit of ${limit} stitched leads exceeded`);
  }
}

// Main matching function
export async function runMatch(
  accountId: number,
  uploadIds: number[],
  policyYaml: string
): Promise<MatchResult> {
  const policy: PolicyConfig = parseYaml(policyYaml);
  const result: MatchResult = {
    stitchedNew: 0,
    linksCreated: 0,
    errors: [],
  };

  try {
    // Get all normalized rows for the uploads
    const rows = await db
      .select()
      .from(normalizedRows)
      .where(
        and(
          eq(normalizedRows.accountId, accountId),
          sql`${normalizedRows.uploadId} = ANY(${uploadIds})`
        )
      )
      .orderBy(normalizedRows.occurredAt);

    logger.info('Starting match process', {
      accountId,
      uploadIds,
      rowCount: rows.length,
      policy: policy.name,
    });

    // Process each row
    for (const row of rows) {
      try {
        // Check usage limit before creating new stitches
        await checkUsageLimit(accountId);

        // Find matching candidates
        const candidates = await findMatchingStitches(row, policy, accountId);
        
        // Pick best candidate
        const winner = pickBestCandidate(candidates, policy, row);
        
        let stitchDbId: number;
        
        if (winner) {
          // Link to existing stitch
          stitchDbId = winner.stitchId;
          logger.debug('Linking to existing stitch', {
            rowId: row.id,
            stitchId: stitchDbId,
            pass: winner.pass,
            reason: winner.reason,
          });
        } else {
          // Create new stitch
          stitchDbId = await createNewStitch(row, accountId);
          result.stitchedNew++;
          
          // Increment usage counter
          await db
            .update(usageCounters)
            .set({
              stitchedCount: sql`${usageCounters.stitchedCount} + 1`,
            })
            .where(eq(usageCounters.accountId, accountId));
          
          logger.debug('Created new stitch', {
            rowId: row.id,
            stitchId: stitchDbId,
          });
        }

        // Link row to stitch
        await linkRowToStitch(row, stitchDbId, winner);
        result.linksCreated++;

        // Recompute attribution
        await recomputeAttribution(stitchDbId, policy);

      } catch (error) {
        const errorMsg = `Failed to process row ${row.id}: ${error.message}`;
        result.errors.push(errorMsg);
        logger.error(errorMsg, { rowId: row.id, error });
      }
    }

    logger.info('Match process completed', {
      accountId,
      result,
    });

    return result;
  } catch (error) {
    logger.error('Match process failed', { accountId, uploadIds, error });
    throw error;
  }
}

