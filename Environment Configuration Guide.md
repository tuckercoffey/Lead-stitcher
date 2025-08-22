# Environment Configuration Guide

This guide provides all the environment variables needed for different deployment scenarios.

## 🔧 Backend Environment Variables

### Required for All Environments

```bash
# Database
DATABASE_URL=postgresql://username:password@host:port/database

# JWT Authentication
JWT_SECRET=your-super-secure-jwt-secret-key-minimum-32-characters

# Server Configuration
PORT=3001
NODE_ENV=production

# Frontend URL (for CORS and redirects)
FRONTEND_URL=https://your-frontend-domain.com
```

### Stripe Configuration (Production)

```bash
# Stripe Live Keys
STRIPE_SECRET_KEY=sk_live_your_actual_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_actual_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_signing_secret
```

### Stripe Configuration (Development)

```bash
# Stripe Test Keys
STRIPE_SECRET_KEY=sk_test_your_test_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_test_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_test_webhook_secret
```

### Optional Configuration

```bash
# File Upload Limits
MAX_FILE_SIZE=10485760  # 10MB in bytes
UPLOAD_DIR=./uploads

# Session Configuration
SESSION_SECRET=your-session-secret-change-this-in-production

# Redis (for production scaling)
REDIS_URL=redis://localhost:6379

# Email Configuration (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

---

## 🎨 Frontend Environment Variables

### Production Configuration

```bash
# API Endpoint
VITE_API_URL=https://your-backend-domain.com/api

# Stripe Publishable Key
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_actual_publishable_key

# App Configuration
VITE_APP_NAME=Lead Stitcher
VITE_APP_URL=https://your-frontend-domain.com
```

### Development Configuration

```bash
# Local Development
VITE_API_URL=http://localhost:3001/api

# Stripe Test Key
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_test_publishable_key

# App Configuration
VITE_APP_NAME=Lead Stitcher (Dev)
VITE_APP_URL=http://localhost:5173
```

---

## 🏗️ Platform-Specific Setup

### Railway Deployment

**Backend Environment Variables:**
```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}  # Auto-provided
JWT_SECRET=generate-secure-32-char-string
STRIPE_SECRET_KEY=sk_live_your_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_secret
FRONTEND_URL=https://your-app.vercel.app
NODE_ENV=production
PORT=3001
```

### Render Deployment

**Backend Environment Variables:**
```bash
DATABASE_URL=auto-provided-by-render
JWT_SECRET=generate-secure-32-char-string
STRIPE_SECRET_KEY=sk_live_your_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_secret
FRONTEND_URL=https://your-app.vercel.app
NODE_ENV=production
```

### Vercel Deployment

**Frontend Environment Variables:**
```bash
VITE_API_URL=https://your-backend.railway.app/api
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_key
```

### Heroku Deployment

**Backend Environment Variables:**
```bash
DATABASE_URL=auto-provided-by-heroku-postgres
JWT_SECRET=generate-secure-32-char-string
STRIPE_SECRET_KEY=sk_live_your_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_secret
FRONTEND_URL=https://your-app.vercel.app
NODE_ENV=production
```

---

## 🔐 Security Best Practices

### JWT Secret Generation

Generate a secure JWT secret:

```bash
# Option 1: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Option 2: Using OpenSSL
openssl rand -hex 32

# Option 3: Online generator
# Visit: https://generate-secret.vercel.app/32
```

### Environment Variable Security

- ✅ **Never commit** `.env` files to version control
- ✅ **Use different keys** for development and production
- ✅ **Rotate secrets** regularly (every 90 days)
- ✅ **Use platform secret management** when available
- ❌ **Don't share** production keys in chat/email
- ❌ **Don't use** weak or predictable secrets

---

## 🧪 Testing Configurations

### Local Development

**Backend (.env):**
```bash
DATABASE_URL=sqlite:./dev.db
JWT_SECRET=dev-jwt-secret-for-testing-only
STRIPE_SECRET_KEY=sk_test_your_test_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_test_key
STRIPE_WEBHOOK_SECRET=whsec_test_secret
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
PORT=3001
```

**Frontend (.env):**
```bash
VITE_API_URL=http://localhost:3001/api
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_test_key
```

### Staging Environment

**Backend:**
```bash
DATABASE_URL=postgresql://staging_db_url
JWT_SECRET=staging-jwt-secret-different-from-prod
STRIPE_SECRET_KEY=sk_test_your_test_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_test_key
STRIPE_WEBHOOK_SECRET=whsec_test_secret
FRONTEND_URL=https://staging-app.vercel.app
NODE_ENV=staging
```

---

## 🔄 Environment Variable Updates

### When to Update

1. **After Stripe account verification** (switch from test to live keys)
2. **When changing domains** (update FRONTEND_URL and webhook URLs)
3. **Security incidents** (rotate all secrets immediately)
4. **Platform migrations** (update DATABASE_URL and other platform-specific vars)

### Update Process

1. **Update environment variables** in your hosting platform
2. **Restart services** to pick up new variables
3. **Test critical functionality** (auth, payments, webhooks)
4. **Update Stripe webhook URLs** if domains changed
5. **Monitor logs** for any configuration errors

---

## 🚨 Troubleshooting

### Common Issues

**"Invalid JWT Secret" errors:**
- Ensure JWT_SECRET is at least 32 characters
- Verify the secret matches across all instances

**Stripe webhook failures:**
- Check STRIPE_WEBHOOK_SECRET matches Stripe dashboard
- Verify webhook URL is accessible and correct

**CORS errors:**
- Ensure FRONTEND_URL exactly matches your frontend domain
- Include protocol (https://) and no trailing slash

**Database connection errors:**
- Verify DATABASE_URL format and credentials
- Check if database service is running

### Environment Validation

Add this to your backend startup to validate configuration:

```javascript
// Add to src/index.ts
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'STRIPE_SECRET_KEY',
  'FRONTEND_URL'
];

requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
});
```

---

*Keep this guide handy during deployment and refer to it when configuring new environments.*

