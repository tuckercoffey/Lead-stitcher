#!/bin/bash

# Lead Stitcher Development Setup Script
echo "🚀 Setting up Lead Stitcher development environment..."

# Check if PostgreSQL is running
if ! brew services list | grep postgresql@14 | grep started > /dev/null; then
    echo "📦 Starting PostgreSQL..."
    brew services start postgresql@14
    sleep 2
fi

# Check if database exists
if ! /opt/homebrew/opt/postgresql@14/bin/psql -lqt | cut -d \| -f 1 | grep -qw leadstitcher; then
    echo "🗄️ Creating database..."
    /opt/homebrew/opt/postgresql@14/bin/createdb leadstitcher
fi

# Set environment variables
export DATABASE_URL=postgresql://localhost:5432/leadstitcher
export JWT_SECRET=dev-jwt-secret-for-testing-only
export FRONTEND_URL=http://localhost:5173
export NODE_ENV=development

echo "✅ Database setup complete!"
echo "📊 Database URL: $DATABASE_URL"
echo ""
echo "🔧 To start the servers:"
echo "  Backend:  cd backend && npm run dev"
echo "  Frontend: cd frontend && npm run dev"
echo ""
echo "🌐 Application URLs:"
echo "  Frontend: http://localhost:5173/"
echo "  Backend:  http://localhost:3001/"
echo "  API:      http://localhost:3001/api"
echo "  Health:   http://localhost:3001/health"
