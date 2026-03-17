// VERSION 1.3 - CLOUD RUN RESILIENCE FIX
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
// Cloud Run sets the PORT env var, usually to 8080
const port = parseInt(process.env.PORT || '8080', 10);

console.log(`[Backend] Starting server on port ${port}...`);

const prisma = new PrismaClient();

// IMPORTANT: Start listening BEFORE doing heavy tasks like DB connection
app.listen(port, '0.0.0.0', () => {
  console.log(`[Backend] Server is UP and listening on 0.0.0.0:${port}`);
});

// Connect to DB in the background
prisma.$connect()
  .then(() => console.log('[Backend] Database connected successfully'))
  .catch((err) => {
    console.error('[Backend] Database connection error (server is still running):', err.message);
  });

app.use(cors());
app.use(express.json());

// API Routes
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

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'Server is running' }));

// Root route
app.get('/', (req, res) => {
  res.status(200).send('Workforce Backend API is active.');
});
