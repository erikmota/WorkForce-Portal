// VERSION 1.5 - CLOUD RUN ULTIMATE RESILIENCE
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load env vars but don't crash if missing
try {
  dotenv.config();
} catch (e) {
  console.log('[Backend] No .env file found, using system env vars');
}

const app = express();
const port = parseInt(process.env.PORT || '8080', 10);

// 1. START LISTENING IMMEDIATELY
// This is the most important part for Cloud Run health checks
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[Backend] ✅ Server is UP and listening on 0.0.0.0:${port}`);
});

// 2. INITIALIZE PRISMA LAZILY
let prisma: PrismaClient;
try {
  prisma = new PrismaClient();
  prisma.$connect()
    .then(() => console.log('[Backend] 🗄️ Database connected'))
    .catch((err) => console.error('[Backend] ❌ Database connection error:', err.message));
} catch (err) {
  console.error('[Backend] ❌ Prisma initialization failed:', err);
}

app.use(cors());
app.use(express.json());

// Health check route (No DB dependency)
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root route
app.get('/', (req, res) => {
  res.status(200).send('Workforce Backend API is active and healthy.');
});

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

app.get('/api/skills', async (req, res) => {
  try {
    const skills = await prisma.skill.findMany({
      include: { company: true }
    });
    res.json(skills);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

app.get('/api/timeslots', async (req, res) => {
  try {
    const slots = await prisma.timeSlot.findMany({
      include: { job: { include: { company: true } } }
    });
    res.json(slots);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timeslots' });
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
