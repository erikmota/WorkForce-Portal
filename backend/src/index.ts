// VERSION 2.5 - PRISMA COMPATIBILITY & CLOUD RUN RESILIENCE
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();

// 1. START LISTENING IMMEDIATELY
// This MUST happen before any database connection attempts to satisfy Cloud Run
const port = parseInt(process.env['PORT'] || '8080', 10);
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[Backend] 🚀 Server is UP and listening on 0.0.0.0:${port}`);
});

// 2. INITIALIZE PRISMA
// We use a try-catch to prevent a crash if the client is missing or misconfigured
let prisma: PrismaClient;
try {
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is MISSING. Please set it in Cloud Run Environment Variables.');
  }
  
  const maskedUrl = dbUrl.replace(/:(\/\/.*):(.*)@/, ': $1:****@');
  console.log('[Backend] ℹ️ DATABASE_URL found:', maskedUrl.substring(0, 30) + '...');
  
  // SOLUÇÃO: Instancie sem argumentos. O Prisma lê process.env.DATABASE_URL automaticamente.
  prisma = new PrismaClient();
  
  // Connect in the background
  prisma.$connect()
    .then(() => console.log('[Backend] 🗄️ Database connected successfully'))
    .catch((err) => {
      console.error('[Backend] ❌ Database connection error:', err.message);
      if (err.code) console.error('[Backend] ❌ Prisma Error Code:', err.code);
    });
} catch (err: any) {
  console.error('[Backend] ❌ Prisma initialization failed:', err.message);
  // We create a dummy object to prevent crashes in route handlers
  prisma = new Proxy({} as PrismaClient, {
    get: (target, prop) => {
      const msg = `Prisma client failed to initialize. Check DATABASE_URL and ensure 'prisma generate' was run. Original error: ${err.message}`;
      if (typeof prop === 'string' && prop.startsWith('$')) {
        return () => Promise.reject(new Error(msg));
      }
      throw new Error(msg);
    }
  });
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
  } catch (error: any) {
    console.error('[Backend] Error fetching companies:', error);
    res.status(500).json({ 
      error: 'Failed to fetch companies', 
      message: error.message,
      code: error.code
    });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: { companies: true }
    });
    res.json(users);
  } catch (error: any) {
    console.error('[Backend] Error fetching users:', error);
    res.status(500).json({ 
      error: 'Failed to fetch users', 
      message: error.message,
      code: error.code
    });
  }
});

app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await prisma.job.findMany({
      include: { timeSlots: true, company: true }
    });
    res.json(jobs);
  } catch (error: any) {
    console.error('[Backend] Error fetching jobs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch jobs', 
      message: error.message,
      code: error.code
    });
  }
});

app.get('/api/skills', async (req, res) => {
  try {
    const skills = await prisma.skill.findMany({
      include: { company: true }
    });
    res.json(skills);
  } catch (error: any) {
    console.error('[Backend] Error fetching skills:', error);
    res.status(500).json({ 
      error: 'Failed to fetch skills', 
      message: error.message,
      code: error.code
    });
  }
});

app.get('/api/timeslots', async (req, res) => {
  try {
    const slots = await prisma.timeSlot.findMany({
      include: { job: { include: { company: true } } }
    });
    res.json(slots);
  } catch (error: any) {
    console.error('[Backend] Error fetching timeslots:', error);
    res.status(500).json({ 
      error: 'Failed to fetch timeslots', 
      message: error.message,
      code: error.code
    });
  }
});

app.get('/api/registrations', async (req, res) => {
  try {
    const registrations = await prisma.registration.findMany({
      include: { user: true, job: true, slot: true }
    });
    res.json(registrations);
  } catch (error: any) {
    console.error('[Backend] Error fetching registrations:', error);
    res.status(500).json({ 
      error: 'Failed to fetch registrations', 
      message: error.message,
      code: error.code
    });
  }
});

app.get('/api/audit-logs', async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: { user: true },
      orderBy: { timestamp: 'desc' }
    });
    res.json(logs);
  } catch (error: any) {
    console.error('[Backend] Error fetching audit logs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch audit logs', 
      message: error.message,
      code: error.code
    });
  }
});