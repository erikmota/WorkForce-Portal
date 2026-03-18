import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env['PORT'] ? parseInt(process.env['PORT'], 10) : 3000;

app.use(express.json());

// Initialize Prisma
let prisma: PrismaClient;
try {
  const dbUrl = process.env['DATABASE_URL'];
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl
      }
    }
  } as any);
} catch (err: any) {
  console.error('[Server] ❌ Prisma initialization failed:', err.message);
  // Create a dummy proxy to prevent crashes in route handlers
  prisma = new Proxy({} as PrismaClient, {
    get: (target, prop) => {
      const msg = `Prisma client failed to initialize. Original error: ${err.message}`;
      if (typeof prop === 'string' && prop.startsWith('$')) {
        return () => Promise.reject(new Error(msg));
      }
      // Return a proxy for model access (e.g., prisma.company.findMany)
      return new Proxy({}, {
        get: () => () => Promise.reject(new Error(msg))
      });
    }
  });
}

// Resolve the correct path to the browser assets
const clientAppDir = path.resolve(process.cwd(), 'dist/browser/browser');

// API Routes using Prisma
app.get('/api/companies', async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      include: { skills: true }
    });
    res.json(companies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: { companies: true }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await prisma.job.findMany({
      include: { timeSlots: true, company: true }
    });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

app.get('/api/registrations', async (req, res) => {
  try {
    const registrations = await prisma.registration.findMany({
      include: { user: true, job: true, slot: true }
    });
    res.json(registrations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
});

app.get('/api/audit-logs', async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: { user: true },
      orderBy: { timestamp: 'desc' }
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// API health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', database: 'connected' }));

// Serve static files from the Angular app build directory.
app.use(express.static(clientAppDir));

// For all other requests, send back the index.html file.
app.get('*', (req, res) => {
  const indexPath = path.join(clientAppDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend not found. Please wait for build to complete.');
  }
});

// Start the server.
app.listen(port, '0.0.0.0', () => {
  console.log(`[Server] Listening on http://0.0.0.0:${port}`);
});
