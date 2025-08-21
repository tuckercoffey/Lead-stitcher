import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { logger } from '../utils/logger';

export interface RawDataRow {
  [key: string]: any;
}

export interface NormalizedData {
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
  original: RawDataRow;
}

export interface ColumnMapping {
  [csvColumn: string]: string;
}

// Normalize phone number to E.164 format
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Remove all non-digit characters first
  const digitsOnly = phone.replace(/\D/g, '');
  
  if (digitsOnly.length === 0) {
    return null;
  }

  try {
    // Try to parse as US number first (most common case)
    let phoneNumber;
    
    if (digitsOnly.length === 10) {
      // Assume US number if 10 digits
      phoneNumber = parsePhoneNumber(digitsOnly, 'US');
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
      // US number with country code
      phoneNumber = parsePhoneNumber(digitsOnly, 'US');
    } else {
      // Try to parse without country assumption
      phoneNumber = parsePhoneNumber(`+${digitsOnly}`);
    }

    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.format('E.164');
    }
  } catch (error) {
    logger.debug('Phone normalization failed:', { phone, error: error.message });
  }

  return null;
}

// Normalize email address
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') {
    return null;
  }

  const trimmed = email.trim().toLowerCase();
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return null;
  }

  return trimmed;
}

// Normalize UTM parameters
export function normalizeUtmMedium(medium: string | null | undefined): string | null {
  if (!medium || typeof medium !== 'string') {
    return null;
  }

  const normalized = medium.toLowerCase().trim();
  
  // Normalize common variations
  const mappings: { [key: string]: string } = {
    'ppc': 'cpc',
    'paid': 'cpc',
    'google-ads': 'cpc',
    'google_ads': 'cpc',
    'adwords': 'cpc',
    'facebook-ads': 'social',
    'facebook_ads': 'social',
    'fb-ads': 'social',
    'linkedin-ads': 'social',
    'linkedin_ads': 'social',
  };

  return mappings[normalized] || normalized;
}

// Normalize UTM source
export function normalizeUtmSource(source: string | null | undefined): string | null {
  if (!source || typeof source !== 'string') {
    return null;
  }

  const normalized = source.toLowerCase().trim();
  
  // Normalize common variations
  const mappings: { [key: string]: string } = {
    'google.com': 'google',
    'google': 'google',
    'facebook.com': 'facebook',
    'fb.com': 'facebook',
    'linkedin.com': 'linkedin',
    'bing.com': 'bing',
    'yahoo.com': 'yahoo',
  };

  return mappings[normalized] || normalized;
}

// Parse timestamp from various formats
export function normalizeTimestamp(timestamp: string | null | undefined): Date | null {
  if (!timestamp || typeof timestamp !== 'string') {
    return null;
  }

  try {
    // Try parsing as ISO string first
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date;
    }

    // Try common formats
    const formats = [
      // MM/DD/YYYY HH:mm:ss
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/,
      // YYYY-MM-DD HH:mm:ss
      /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})$/,
      // MM/DD/YYYY
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      // YYYY-MM-DD
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    ];

    for (const format of formats) {
      const match = timestamp.match(format);
      if (match) {
        // Parse based on format
        if (format.source.includes('MM/DD/YYYY')) {
          const [, month, day, year, hour = '0', minute = '0', second = '0'] = match;
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 
                         parseInt(hour), parseInt(minute), parseInt(second));
        } else {
          const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day),
                         parseInt(hour), parseInt(minute), parseInt(second));
        }
      }
    }
  } catch (error) {
    logger.debug('Timestamp normalization failed:', { timestamp, error: error.message });
  }

  return null;
}

// Parse numeric amount
export function normalizeAmount(amount: string | number | null | undefined): number | null {
  if (amount === null || amount === undefined) {
    return null;
  }

  if (typeof amount === 'number') {
    return isNaN(amount) ? null : amount;
  }

  if (typeof amount === 'string') {
    // Remove currency symbols and commas
    const cleaned = amount.replace(/[$,\s]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }

  return null;
}

// Parse duration in seconds
export function normalizeDuration(duration: string | number | null | undefined): number | null {
  if (duration === null || duration === undefined) {
    return null;
  }

  if (typeof duration === 'number') {
    return isNaN(duration) ? null : Math.round(duration);
  }

  if (typeof duration === 'string') {
    // Handle formats like "1:23" (minutes:seconds) or "123" (seconds)
    if (duration.includes(':')) {
      const parts = duration.split(':');
      if (parts.length === 2) {
        const minutes = parseInt(parts[0]) || 0;
        const seconds = parseInt(parts[1]) || 0;
        return minutes * 60 + seconds;
      }
    } else {
      const parsed = parseInt(duration);
      return isNaN(parsed) ? null : parsed;
    }
  }

  return null;
}

// Main normalization function
export function normalizeData(rawRow: RawDataRow, columnMapping: ColumnMapping): NormalizedData | null {
  try {
    const normalized: Partial<NormalizedData> = {
      original: rawRow,
    };

    // Map and normalize each field
    for (const [csvColumn, normalizedField] of Object.entries(columnMapping)) {
      const rawValue = rawRow[csvColumn];

      switch (normalizedField) {
        case 'occurred_at':
          const timestamp = normalizeTimestamp(rawValue);
          if (timestamp) {
            normalized.occurredAt = timestamp;
          }
          break;

        case 'phone':
          normalized.phone = normalizePhone(rawValue);
          break;

        case 'email':
          normalized.email = normalizeEmail(rawValue);
          break;

        case 'utm_source':
          normalized.utmSource = normalizeUtmSource(rawValue);
          break;

        case 'utm_medium':
          normalized.utmMedium = normalizeUtmMedium(rawValue);
          break;

        case 'amount':
          normalized.amount = normalizeAmount(rawValue);
          break;

        case 'duration_sec':
          normalized.durationSec = normalizeDuration(rawValue);
          break;

        case 'name':
        case 'gclid':
        case 'client_id':
        case 'utm_campaign':
        case 'landing_page':
        case 'location':
        case 'external_id':
          if (rawValue && typeof rawValue === 'string') {
            normalized[normalizedField as keyof NormalizedData] = rawValue.trim();
          }
          break;
      }
    }

    // Validate required fields
    if (!normalized.occurredAt) {
      logger.warn('Row missing required occurred_at field:', rawRow);
      return null;
    }

    return normalized as NormalizedData;
  } catch (error) {
    logger.error('Data normalization failed:', { rawRow, error: error.message });
    return null;
  }
}

// Batch normalize multiple rows
export function normalizeDataBatch(
  rawRows: RawDataRow[],
  columnMapping: ColumnMapping
): NormalizedData[] {
  const normalized: NormalizedData[] = [];
  
  for (const rawRow of rawRows) {
    const normalizedRow = normalizeData(rawRow, columnMapping);
    if (normalizedRow) {
      normalized.push(normalizedRow);
    }
  }

  logger.info('Batch normalization completed:', {
    inputRows: rawRows.length,
    outputRows: normalized.length,
    successRate: `${Math.round((normalized.length / rawRows.length) * 100)}%`,
  });

  return normalized;
}

