import { Express } from 'express';
import authRoutes from './auth';
import billingRoutes from './billing';
import usageRoutes from './usage';
import templatesRoutes from './templates';
import uploadsRoutes from './uploads';
import policiesRoutes from './policies';
import matchRoutes from './match';
import exportsRoutes from './exports';
import adminRoutes from './admin';

export function setupRoutes(app: Express): void {
  // API prefix
  const API_PREFIX = '/api';

  // Mount routes
  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/billing`, billingRoutes);
  app.use(`${API_PREFIX}/usage`, usageRoutes);
  app.use(`${API_PREFIX}/templates`, templatesRoutes);
  app.use(`${API_PREFIX}/uploads`, uploadsRoutes);
  app.use(`${API_PREFIX}/policies`, policiesRoutes);
  app.use(`${API_PREFIX}/match`, matchRoutes);
  app.use(`${API_PREFIX}/exports`, exportsRoutes);
  app.use(`${API_PREFIX}/admin`, adminRoutes);

  // API info endpoint
  app.get(`${API_PREFIX}`, (req, res) => {
    res.json({
      name: 'Lead Stitcher API',
      version: '1.0.0',
      description: 'CSV-based lead attribution and matching platform',
      endpoints: {
        auth: `${API_PREFIX}/auth`,
        billing: `${API_PREFIX}/billing`,
        usage: `${API_PREFIX}/usage`,
        templates: `${API_PREFIX}/templates`,
        uploads: `${API_PREFIX}/uploads`,
        policies: `${API_PREFIX}/policies`,
        match: `${API_PREFIX}/match`,
        exports: `${API_PREFIX}/exports`,
        admin: `${API_PREFIX}/admin`,
      },
    });
  });
}

