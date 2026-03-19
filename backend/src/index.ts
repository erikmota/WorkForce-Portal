// VERSION 2.5 - PRISMA COMPATIBILITY & CLOUD RUN RESILIENCE
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

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
  
  const mariadbUrl = dbUrl.replace(/^mysql:\/\//, 'mariadb://');
  const adapter = new PrismaMariaDb(mariadbUrl);
  
  // SOLUÇÃO: Instancie com o adapter MariaDB
  prisma = new PrismaClient({ adapter });
  
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
    
    // Map to frontend format
    const mappedUsers = users.map(user => {
      const rolesByCompany: Record<string, string> = {};
      const statusByCompany: Record<string, string> = {};
      const skillsByCompany: Record<string, string[]> = {};
      const companyIds: string[] = [];
      
      user.companies.forEach(uc => {
        rolesByCompany[uc.companyId] = uc.role;
        statusByCompany[uc.companyId] = uc.status;
        skillsByCompany[uc.companyId] = (uc.skills as string[]) || [];
        companyIds.push(uc.companyId);
      });
      
      return {
        ...user,
        rolesByCompany,
        statusByCompany,
        skillsByCompany,
        companyIds,
        companies: undefined // remove the original relation
      };
    });
    
    res.json(mappedUsers);
  } catch (error: any) {
    console.error('[Backend] Error fetching users:', error);
    res.status(500).json({ 
      error: 'Failed to fetch users', 
      message: error.message,
      code: error.code
    });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { 
      id,
      name, 
      username, 
      password, 
      isGlobalAdmin, 
      dailyRate, 
      profilePictureUrl, 
      phone, 
      address, 
      bankDetails,
      notifications,
      needsOnboarding,
      rolesByCompany,
      statusByCompany,
      skillsByCompany
    } = req.body;

    // Create the main User record
    const newUser = await prisma.user.create({
      data: {
        id,
        name,
        username,
        password,
        isGlobalAdmin,
        dailyRate,
        profilePictureUrl,
        phone,
        address: address !== undefined ? address : undefined,
        bankDetails: bankDetails !== undefined ? bankDetails : undefined,
        notifications: notifications !== undefined ? notifications : undefined,
        needsOnboarding: needsOnboarding !== undefined ? needsOnboarding : undefined,
      }
    });

    // Handle UserCompany creation if provided
    if (rolesByCompany || statusByCompany || skillsByCompany) {
      const companies = await prisma.company.findMany();
      
      for (const company of companies) {
        const role = rolesByCompany?.[company.id];
        const status = statusByCompany?.[company.id];
        const skills = skillsByCompany?.[company.id];

        if (role || status || skills) {
          await prisma.userCompany.create({
            data: {
              userId: newUser.id,
              companyId: company.id,
              role: role || 'user',
              status: status || 'active',
              skills: skills || []
            }
          });
        }
      }
    }

    // Fetch the created user with companies to return
    const finalUser = await prisma.user.findUnique({
      where: { id: newUser.id },
      include: { companies: true }
    });

    if (!finalUser) {
      return res.status(404).json({ error: 'User not found after creation' });
    }

    const rolesByCompanyMap: Record<string, string> = {};
    const statusByCompanyMap: Record<string, string> = {};
    const skillsByCompanyMap: Record<string, string[]> = {};
    const companyIds: string[] = [];
    
    finalUser.companies.forEach(uc => {
      rolesByCompanyMap[uc.companyId] = uc.role;
      statusByCompanyMap[uc.companyId] = uc.status;
      skillsByCompanyMap[uc.companyId] = (uc.skills as string[]) || [];
      companyIds.push(uc.companyId);
    });

    res.status(201).json({
      ...finalUser,
      rolesByCompany: rolesByCompanyMap,
      statusByCompany: statusByCompanyMap,
      skillsByCompany: skillsByCompanyMap,
      companyIds,
      companies: undefined
    });
  } catch (error: any) {
    console.error('[Backend] Error creating user:', error);
    res.status(500).json({ 
      error: 'Failed to create user', 
      message: error.message,
      code: error.code
    });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      username, 
      password, 
      isGlobalAdmin, 
      dailyRate, 
      profilePictureUrl, 
      phone, 
      address, 
      bankDetails,
      notifications,
      needsOnboarding,
      rolesByCompany,
      statusByCompany,
      skillsByCompany
    } = req.body;

    // Update the main User record
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name,
        username,
        password,
        isGlobalAdmin,
        dailyRate,
        profilePictureUrl,
        phone,
        address: address !== undefined ? address : undefined,
        bankDetails: bankDetails !== undefined ? bankDetails : undefined,
        notifications: notifications !== undefined ? notifications : undefined,
        needsOnboarding: needsOnboarding !== undefined ? needsOnboarding : undefined,
      }
    });

    // Handle UserCompany updates if provided
    if (rolesByCompany || statusByCompany || skillsByCompany) {
      // Get all companies to iterate over
      const companies = await prisma.company.findMany();
      
      for (const company of companies) {
        const role = rolesByCompany?.[company.id];
        const status = statusByCompany?.[company.id];
        const skills = skillsByCompany?.[company.id];

        if (role || status || skills) {
          await prisma.userCompany.upsert({
            where: {
              userId_companyId: {
                userId: id,
                companyId: company.id
              }
            },
            update: {
              ...(role && { role }),
              ...(status && { status }),
              ...(skills && { skills })
            },
            create: {
              userId: id,
              companyId: company.id,
              role: role || 'user',
              status: status || 'active',
              skills: skills || []
            }
          });
        }
      }
    }

    // Fetch the updated user with companies to return
    const finalUser = await prisma.user.findUnique({
      where: { id },
      include: { companies: true }
    });

    if (!finalUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const rolesByCompanyMap: Record<string, string> = {};
    const statusByCompanyMap: Record<string, string> = {};
    const skillsByCompanyMap: Record<string, string[]> = {};
    const companyIds: string[] = [];
    
    finalUser.companies.forEach(uc => {
      rolesByCompanyMap[uc.companyId] = uc.role;
      statusByCompanyMap[uc.companyId] = uc.status;
      skillsByCompanyMap[uc.companyId] = (uc.skills as string[]) || [];
      companyIds.push(uc.companyId);
    });

    res.json({
      ...finalUser,
      rolesByCompany: rolesByCompanyMap,
      statusByCompany: statusByCompanyMap,
      skillsByCompany: skillsByCompanyMap,
      companyIds,
      companies: undefined
    });
  } catch (error: any) {
    console.error('[Backend] Error updating user:', error);
    res.status(500).json({ 
      error: 'Failed to update user', 
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

app.post('/api/jobs', async (req, res) => {
  try {
    const { 
      title, 
      description, 
      location, 
      companyId, 
      isGrouped, 
      hideTitleFromUser, 
      offersTransportation, 
      transportationDepartureLocation, 
      transportationDepartureTime 
    } = req.body;

    const newJob = await prisma.job.create({
      data: {
        title,
        description,
        location,
        companyId,
        isGrouped: isGrouped || false,
        hideTitleFromUser: hideTitleFromUser || false,
        offersTransportation: offersTransportation || false,
        transportationDepartureLocation,
        transportationDepartureTime
      },
      include: { company: true }
    });
    res.status(201).json(newJob);
  } catch (error: any) {
    console.error('[Backend] Error creating job:', error);
    res.status(500).json({ error: 'Failed to create job', message: error.message });
  }
});

app.put('/api/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, 
      description, 
      location, 
      companyId, 
      isGrouped, 
      hideTitleFromUser, 
      offersTransportation, 
      transportationDepartureLocation, 
      transportationDepartureTime 
    } = req.body;

    const updatedJob = await prisma.job.update({
      where: { id },
      data: {
        title,
        description,
        location,
        companyId,
        isGrouped: isGrouped !== undefined ? isGrouped : undefined,
        hideTitleFromUser: hideTitleFromUser !== undefined ? hideTitleFromUser : undefined,
        offersTransportation: offersTransportation !== undefined ? offersTransportation : undefined,
        transportationDepartureLocation: transportationDepartureLocation !== undefined ? transportationDepartureLocation : undefined,
        transportationDepartureTime: transportationDepartureTime !== undefined ? transportationDepartureTime : undefined
      },
      include: { company: true }
    });
    res.json(updatedJob);
  } catch (error: any) {
    console.error('[Backend] Error updating job:', error);
    res.status(500).json({ error: 'Failed to update job', message: error.message });
  }
});

app.delete('/api/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.job.delete({
      where: { id }
    });
    res.status(204).send();
  } catch (error: any) {
    console.error('[Backend] Error deleting job:', error);
    res.status(500).json({ error: 'Failed to delete job', message: error.message });
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
    
    const mappedSlots = slots.map(s => ({
      ...s,
      job: {
        ...s.job,
        companyName: s.job.company.name
      }
    }));
    
    res.json(mappedSlots);
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
      include: { user: true, job: { include: { company: true } }, slot: true }
    });
    
    const mappedRegistrations = registrations.map(r => ({
      ...r,
      startTime: r.slot.startTime,
      endTime: r.slot.endTime,
      job: {
        ...r.job,
        companyName: r.job.company.name
      }
    }));
    
    res.json(mappedRegistrations);
  } catch (error: any) {
    console.error('[Backend] Error fetching registrations:', error);
    res.status(500).json({ 
      error: 'Failed to fetch registrations', 
      message: error.message,
      code: error.code
    });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete related records first
    await prisma.userCompany.deleteMany({ where: { userId: id } });
    await prisma.registration.deleteMany({ where: { userId: id } });
    await prisma.auditLog.deleteMany({ where: { userId: id } });
    
    await prisma.user.delete({
      where: { id }
    });
    res.status(204).send();
  } catch (error: any) {
    console.error('[Backend] Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user', message: error.message });
  }
});

app.post('/api/users/:id/change-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;
    
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.password !== currentPassword) {
      return res.status(401).json({ error: 'Invalid current password' });
    }
    
    await prisma.user.update({
      where: { id },
      data: { password: newPassword }
    });
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to change password', message: error.message });
  }
});

app.post('/api/emails/send-welcome', async (req, res) => {
  // Mock email sending
  res.json({ success: true });
});

// Companies
app.post('/api/companies', async (req, res) => {
  try {
    const company = await prisma.company.create({ data: req.body });
    res.status(201).json(company);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create company', message: error.message });
  }
});

app.put('/api/companies/:id', async (req, res) => {
  try {
    const company = await prisma.company.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(company);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update company', message: error.message });
  }
});

app.delete('/api/companies/:id', async (req, res) => {
  try {
    await prisma.company.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete company', message: error.message });
  }
});

// Skills
app.post('/api/skills', async (req, res) => {
  try {
    const skill = await prisma.skill.create({ data: req.body });
    res.status(201).json(skill);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create skill', message: error.message });
  }
});

app.put('/api/skills/:id', async (req, res) => {
  try {
    const skill = await prisma.skill.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(skill);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update skill', message: error.message });
  }
});

app.delete('/api/skills/:id', async (req, res) => {
  try {
    await prisma.skill.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete skill', message: error.message });
  }
});

// TimeSlots
app.post('/api/timeslots', async (req, res) => {
  try {
    const { job, ...rest } = req.body;
    const slot = await prisma.timeSlot.create({
      data: {
        ...rest,
        job: {
          connectOrCreate: {
            where: { id: job.id },
            create: {
              id: job.id,
              title: job.title,
              description: job.description,
              location: job.location,
              companyId: job.companyId,
              isGrouped: job.isGrouped,
              hideTitleFromUser: job.hideTitleFromUser,
              offersTransportation: job.offersTransportation,
              transportationDepartureLocation: job.transportationDepartureLocation,
              transportationDepartureTime: job.transportationDepartureTime,
            }
          }
        }
      },
      include: { job: { include: { company: true } } }
    });
    res.status(201).json({
      ...slot,
      job: {
        ...slot.job,
        companyName: slot.job.company.name
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create timeslot', message: error.message });
  }
});

app.put('/api/timeslots/:id', async (req, res) => {
  try {
    const { job, ...rest } = req.body;
    
    if (job) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          title: job.title,
          description: job.description,
          location: job.location,
          companyId: job.companyId,
          isGrouped: job.isGrouped,
          hideTitleFromUser: job.hideTitleFromUser,
          offersTransportation: job.offersTransportation,
          transportationDepartureLocation: job.transportationDepartureLocation,
          transportationDepartureTime: job.transportationDepartureTime,
        }
      });
    }

    const slot = await prisma.timeSlot.update({
      where: { id: req.params.id },
      data: rest,
      include: { job: { include: { company: true } } }
    });
    res.json({
      ...slot,
      job: {
        ...slot.job,
        companyName: slot.job.company.name
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update timeslot', message: error.message });
  }
});

app.delete('/api/timeslots/:id', async (req, res) => {
  try {
    await prisma.timeSlot.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete timeslot', message: error.message });
  }
});

// Registrations
app.post('/api/registrations', async (req, res) => {
  try {
    const { slotId, jobId, userId, ...rest } = req.body;
    const registration = await prisma.registration.create({
      data: {
        ...rest,
        slot: { connect: { id: slotId } },
        job: { connect: { id: jobId } },
        user: { connect: { id: userId } }
      },
      include: { user: true, job: { include: { company: true } }, slot: true }
    });
    
    res.status(201).json({
      ...registration,
      startTime: registration.slot.startTime,
      endTime: registration.slot.endTime
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create registration', message: error.message });
  }
});

app.put('/api/registrations/:id/approve', async (req, res) => {
  try {
    const { comment, selectedSkill } = req.body;
    const registration = await prisma.registration.update({
      where: { id: req.params.id },
      data: {
        status: 'approved',
        comment,
        registeredWithSkill: selectedSkill
      },
      include: { user: true, job: { include: { company: true } }, slot: true }
    });
    
    res.json({
      ...registration,
      startTime: registration.slot.startTime,
      endTime: registration.slot.endTime
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to approve registration', message: error.message });
  }
});

app.delete('/api/registrations/:id', async (req, res) => {
  try {
    await prisma.registration.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete registration', message: error.message });
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