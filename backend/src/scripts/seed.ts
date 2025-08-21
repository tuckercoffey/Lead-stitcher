import { db, client } from '../db/connection';
import { plans, policies } from '../db/schema';
import * as dotenv from 'dotenv';

dotenv.config();

const defaultPolicies = {
  paid_last_roofing_default: `
# Paid-Last Attribution Policy for Roofing/HVAC
name: "Paid-Last Roofing Default"
attribution_mode: "paid_last"
windows:
  phone_exact: 30  # days
  email_exact: 30  # days
  click_chain: 7   # days
  fuzzy_match: 1   # days
weights:
  phone_exact: 1.0
  email_exact: 0.9
  click_chain: 0.7
  fuzzy_match: 0.5
tie_breakers:
  - "latest_event_time"
  - "longer_call_duration"
  - "higher_revenue"
normalization:
  phone_format: "e164"
  email_lowercase: true
  utm_mapping:
    ppc: "cpc"
    paid: "cpc"
confidence_rules:
  two_deterministic: 1.0
  one_deterministic: 0.9
  click_only: 0.7
  fuzzy_only: 0.5
`,
  first_touch_pi_law: `
# First-Touch Attribution for Personal Injury Law
name: "First-Touch PI Law"
attribution_mode: "first_touch"
windows:
  phone_exact: 60  # longer window for legal
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
  dental_appt_equal_weight: `
# Equal Weight Attribution for Dental
name: "Dental Appointment Equal Weight"
attribution_mode: "equal_weight"
windows:
  phone_exact: 14  # shorter window
  email_exact: 14
  click_chain: 3
  fuzzy_match: 1
weights:
  phone_exact: 1.0
  email_exact: 1.0  # equal weight
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
  auto_call_last: `
# Call-Last Attribution for Auto Services
name: "Auto Call-Last"
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
`
};

async function seedDatabase() {
  console.log('Seeding database...');
  
  try {
    // Seed plans
    console.log('Seeding plans...');
    await db.insert(plans).values([
      { code: 'FREE', monthlyLimit: 250, priceUsd: 0 },
      { code: 'STARTER', monthlyLimit: 5000, priceUsd: 10 },
      { code: 'PRO', monthlyLimit: 10000, priceUsd: 20 }
    ]).onConflictDoNothing();

    // Seed default policies (account_id will be set when accounts are created)
    console.log('Seeding default policies...');
    const policyEntries = Object.entries(defaultPolicies).map(([key, yaml]) => ({
      accountId: 0, // Will be updated when accounts are created
      name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      yaml: yaml.trim(),
      isDefault: true
    }));

    // Note: These will be inserted per account during account creation
    console.log('Default policies prepared for account creation');

    console.log('✅ Database seeded successfully');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedDatabase();

