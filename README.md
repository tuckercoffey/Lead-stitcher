# Lead Stitcher MVP

A CSV-based lead attribution and matching platform that ingests multiple data sources (calls, forms, chats, appointments, invoices), normalizes them, and matches events into unified leads with clear attribution.

## Features

- **Multi-source CSV ingestion** with smart column mapping
- **Advanced lead matching** using phone, email, click tracking, and fuzzy matching
- **Attribution analytics** with multiple models (Paid-Last, First-Touch, Last-Touch, Call-First)
- **Stripe billing integration** with usage-based plans
- **Export capabilities** for Final Attribution and Audit Trail reports
- **Policy-based matching** with industry presets (Roofing, HVAC, PI Law, Dental, Auto)

## Tech Stack

- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Authentication**: Session-based auth with secure cookies
- **Payments**: Stripe Checkout + Customer Portal + Webhooks
- **CSV Processing**: PapaParse (frontend), csv-parse (backend)
- **Job Queue**: BullMQ with Redis

## Project Structure

```
├── frontend/          # React application
├── backend/           # Node.js API server
├── shared/            # Shared types and utilities
├── docs/              # Documentation
└── scripts/           # Build and deployment scripts
```

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Stripe account (for billing)

### Development Setup

1. Clone the repository
2. Install dependencies: `npm run install:all`
3. Set up environment variables (see `.env.example` files)
4. Run database migrations: `npm run db:migrate`
5. Seed initial data: `npm run db:seed`
6. Start development servers: `npm run dev`

### Plans & Pricing

- **Free**: 250 stitched leads/month
- **Starter**: $10/month, 5,000 stitched leads
- **Pro**: $20/month, 10,000+ stitched leads

## License

MIT License

