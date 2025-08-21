import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

export interface CSVColumn {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  required: boolean;
  description?: string;
}

export interface CSVParseResult {
  headers: string[];
  rows: Record<string, any>[];
  totalRows: number;
  detectedType?: string;
  errors: string[];
}

export interface ColumnMapping {
  [csvColumn: string]: string; // Maps CSV column to normalized field
}

export interface NormalizedRow {
  occurred_at?: Date;
  name?: string;
  phone?: string;
  email?: string;
  gclid?: string;
  client_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  landing_page?: string;
  location?: string;
  duration_sec?: number;
  amount?: number;
  external_id?: string;
  source_file: string;
  original_row_id: string;
  raw_data: Record<string, any>;
}

export class CSVProcessor {
  private readonly UPLOAD_DIR = path.join(process.cwd(), 'uploads');

  constructor() {
    this.ensureUploadDir();
  }

  private async ensureUploadDir(): Promise<void> {
    try {
      await fs.mkdir(this.UPLOAD_DIR, { recursive: true });
    } catch (error) {
      logger.error('Failed to create upload directory', {
        error: error.message,
        uploadDir: this.UPLOAD_DIR,
      });
    }
  }

  /**
   * Parse CSV file and return structured data
   */
  async parseCSV(filePath: string): Promise<CSVParseResult> {
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const rows: Record<string, any>[] = [];
      const errors: string[] = [];
      let headers: string[] = [];

      return new Promise((resolve, reject) => {
        parse(fileContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          cast: true,
        })
        .on('headers', (headerList: string[]) => {
          headers = headerList;
        })
        .on('data', (row: Record<string, any>) => {
          rows.push(row);
        })
        .on('error', (error) => {
          errors.push(error.message);
        })
        .on('end', () => {
          const detectedType = this.detectSourceType(headers);
          
          resolve({
            headers,
            rows,
            totalRows: rows.length,
            detectedType,
            errors,
          });
        });
      });
    } catch (error) {
      logger.error('Failed to parse CSV file', {
        filePath,
        error: error.message,
      });
      throw new Error(`Failed to parse CSV: ${error.message}`);
    }
  }

  /**
   * Detect the likely source type based on column headers
   */
  private detectSourceType(headers: string[]): string | undefined {
    const lowerHeaders = headers.map(h => h.toLowerCase());

    // Phone calls detection
    if (lowerHeaders.some(h => h.includes('duration') || h.includes('call'))) {
      return 'calls';
    }

    // Forms detection
    if (lowerHeaders.some(h => h.includes('form') || h.includes('lead'))) {
      return 'forms';
    }

    // Appointments detection
    if (lowerHeaders.some(h => h.includes('appointment') || h.includes('booking'))) {
      return 'appts';
    }

    // Invoices detection
    if (lowerHeaders.some(h => h.includes('invoice') || h.includes('amount') || h.includes('total'))) {
      return 'invoices';
    }

    // Chat detection
    if (lowerHeaders.some(h => h.includes('message') || h.includes('chat'))) {
      return 'chats';
    }

    return undefined;
  }

  /**
   * Normalize CSV data using column mapping
   */
  async normalizeData(
    parseResult: CSVParseResult,
    columnMapping: ColumnMapping,
    sourceType: string,
    sourceFile: string
  ): Promise<NormalizedRow[]> {
    const normalizedRows: NormalizedRow[] = [];

    for (let i = 0; i < parseResult.rows.length; i++) {
      const row = parseResult.rows[i];
      const normalizedRow: NormalizedRow = {
        source_file: sourceFile,
        original_row_id: `${sourceFile}_${i + 1}`,
        raw_data: { ...row },
      };

      // Apply column mappings
      for (const [csvColumn, normalizedField] of Object.entries(columnMapping)) {
        const value = row[csvColumn];
        if (value !== undefined && value !== null && value !== '') {
          switch (normalizedField) {
            case 'occurred_at':
              normalizedRow.occurred_at = this.parseDate(value);
              break;
            case 'name':
              normalizedRow.name = this.cleanString(value);
              break;
            case 'phone':
              normalizedRow.phone = this.cleanPhone(value);
              break;
            case 'email':
              normalizedRow.email = this.cleanEmail(value);
              break;
            case 'gclid':
              normalizedRow.gclid = this.cleanString(value);
              break;
            case 'client_id':
              normalizedRow.client_id = this.cleanString(value);
              break;
            case 'utm_source':
              normalizedRow.utm_source = this.cleanString(value);
              break;
            case 'utm_medium':
              normalizedRow.utm_medium = this.cleanString(value);
              break;
            case 'utm_campaign':
              normalizedRow.utm_campaign = this.cleanString(value);
              break;
            case 'landing_page':
              normalizedRow.landing_page = this.cleanUrl(value);
              break;
            case 'location':
              normalizedRow.location = this.cleanString(value);
              break;
            case 'duration_sec':
              normalizedRow.duration_sec = this.parseNumber(value);
              break;
            case 'amount':
              normalizedRow.amount = this.parseNumber(value);
              break;
            case 'external_id':
              normalizedRow.external_id = this.cleanString(value);
              break;
          }
        }
      }

      normalizedRows.push(normalizedRow);
    }

    logger.info('Data normalized', {
      sourceFile,
      sourceType,
      originalRows: parseResult.rows.length,
      normalizedRows: normalizedRows.length,
    });

    return normalizedRows;
  }

  /**
   * Export data to CSV format
   */
  async exportToCSV(data: any[], columns: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      stringify(data, {
        header: true,
        columns: columns,
      }, (err, output) => {
        if (err) {
          reject(new Error(`CSV export failed: ${err.message}`));
        } else {
          resolve(output);
        }
      });
    });
  }

  /**
   * Save file to upload directory
   */
  async saveFile(buffer: Buffer, filename: string): Promise<string> {
    const filePath = path.join(this.UPLOAD_DIR, filename);
    await fs.writeFile(filePath, buffer);
    
    logger.info('File saved', {
      filename,
      filePath,
      size: buffer.length,
    });

    return filePath;
  }

  /**
   * Clean and validate data helpers
   */
  private parseDate(value: any): Date | undefined {
    if (!value) return undefined;
    
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  }

  private cleanString(value: any): string | undefined {
    if (!value) return undefined;
    
    const cleaned = String(value).trim();
    return cleaned.length > 0 ? cleaned : undefined;
  }

  private cleanPhone(value: any): string | undefined {
    if (!value) return undefined;
    
    // Remove all non-digit characters except +
    const cleaned = String(value).replace(/[^\d+]/g, '');
    return cleaned.length >= 10 ? cleaned : undefined;
  }

  private cleanEmail(value: any): string | undefined {
    if (!value) return undefined;
    
    const email = String(value).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) ? email : undefined;
  }

  private cleanUrl(value: any): string | undefined {
    if (!value) return undefined;
    
    const url = String(value).trim();
    try {
      new URL(url);
      return url;
    } catch {
      // Try adding protocol
      try {
        new URL(`https://${url}`);
        return `https://${url}`;
      } catch {
        return undefined;
      }
    }
  }

  private parseNumber(value: any): number | undefined {
    if (!value) return undefined;
    
    const num = parseFloat(String(value).replace(/[^\d.-]/g, ''));
    return isNaN(num) ? undefined : num;
  }

  /**
   * Get file info
   */
  async getFileInfo(filePath: string): Promise<{ size: number; exists: boolean }> {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        exists: true,
      };
    } catch {
      return {
        size: 0,
        exists: false,
      };
    }
  }

  /**
   * Delete file
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      logger.info('File deleted', { filePath });
    } catch (error) {
      logger.warn('Failed to delete file', {
        filePath,
        error: error.message,
      });
    }
  }
}

export const csvProcessor = new CSVProcessor();

