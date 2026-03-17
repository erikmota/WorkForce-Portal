import { Company } from '../models/company.model';
import { Skill } from '../models/skill.model';
import { Job } from '../models/job.model';
import { TimeSlot } from '../models/timeslot.model';
import { User } from '../models/user.model';
import { Registration } from '../models/registration.model';
import { AuditLog } from '../models/audit-log.model';

// --- COMPANIES ---
export const MOCK_COMPANIES: Company[] = [
    { id: '1', name: 'CARROÇÃO', address: 'Rod. SP-340, Km 128.5', city: 'Mogi Mirim', state: 'SP', phone1: '19-3805-7200', email: 'contato@carrocao.com', contactName: 'Mariana Silva', contractType: 'anual', contractValue: 250000, bannerImageUrl: 'https://images.seeklogo.com/logo-png/39/1/sitio-do-carrocao-logo-png_seeklogo-395715.png', defaultStartTime: '08:00', defaultEndTime: '17:00', maxMonthlyHiresPerUser: 5 },
    { id: '2', name: 'ACAMPARK', address: 'Estr. do Rio Acima, 4411', city: 'Mairiporã', state: 'SP', phone1: '11-4485-1229', email: 'contato@acampark.com.br', contactName: 'João Pereira', contractType: 'monthly', contractValue: 20000, bannerImageUrl: 'https://www.promoventos.com.br/wp-content/uploads/2023/09/logo-acampark.png', defaultStartTime: '09:00', defaultEndTime: '18:00', maxMonthlyHiresPerUser: 3 },
    { id: '3', name: 'AGENCIA QUALQUER', address: 'Av. Paulista, 1000', city: 'São Paulo', state: 'SP', phone1: '11-99999-8888', email: 'eventos@agenciaqualquer.com', contactName: 'Carlos Andrade', contractType: 'other', contractValue: 5000 },
];

// --- SKILLS ---
export const MOCK_SKILLS: Skill[] = [
    { id: 'sk1', name: 'MONITOR', companyId: '1' },
    { id: 'sk2', name: 'GUIA', companyId: '1' },
    { id: 'sk3', name: 'AUXILIAR DE COORDENACAO', companyId: '1' },
    { id: 'sk4', name: 'COORDENADOR', companyId: '1' },
    { id: 'sk5', name: 'MONITOR', companyId: '2' },
    { id: 'sk6', name: 'GUIA', companyId: '2' },
    { id: 'sk7', name: 'COORDENADOR', companyId: '2' },
];

// --- JOBS ---
export const MOCK_JOBS: Record<string, Job> = {
    'j1': { id: 'j1', title: 'Day Use - Colégio Saber', companyId: '1', companyName: 'CARROÇÃO', description: 'Atividade de um dia para os alunos do 6º ano do Colégio Saber. Necessário monitores para acompanhar os grupos nas trilhas e atividades aquáticas.', location: 'Sede Carroção' },
    'j2': { id: 'j2', title: 'Temporada de Férias Julho', companyId: '2', companyName: 'ACAMPARK', description: 'Temporada de férias de uma semana para crianças de 10 a 14 anos. Vagas para todas as funções.', location: 'Sede Acampark', isGrouped: true },
    'j3': { id: 'j3', title: 'Evento Corporativo', companyId: '3', companyName: 'AGENCIA QUALQUER', description: 'Evento de team building para empresa cliente. Necessário guias e coordenador.', location: 'Sede Carroção', hideTitleFromUser: true },
    'j4': { id: 'j4', title: 'Acampamento de Imersão em Inglês', companyId: '1', companyName: 'CARROÇÃO', description: 'Acampamento de 3 dias com foco em inglês. Monitores fluentes são um diferencial.', location: 'Sede Carroção', isGrouped: true },
    'j5': { id: 'j5', title: 'Day Use - Escola Crescer', companyId: '2', companyName: 'ACAMPARK', description: 'Atividade de um dia com foco em educação ambiental para o 4º ano.', location: 'Sede Acampark' },
    'j6': { id: 'j6', title: 'Festa Junina - Escola Aprender', companyId: '1', companyName: 'CARROÇÃO', description: 'Grande evento de Festa Junina para a Escola Aprender. Monitores para barracas e gincanas.', location: 'Sede Carroção' },
    'j7': { id: 'j7', title: 'Temporada de Férias de Verão', companyId: '2', companyName: 'ACAMPARK', description: 'Temporada de 5 dias para adolescentes. Muitas atividades aquáticas e jogos noturnos.', location: 'Sede Acampark', isGrouped: true },
    'j8': { id: 'j8', title: 'Treinamento de Monitores', companyId: '1', companyName: 'CARROÇÃO', description: 'Treinamento interno para novos monitores. Foco em segurança e recreação.', location: 'Sede Carroção', offersTransportation: true, transportationDepartureLocation: 'Metrô Tatuapé', transportationDepartureTime: '07:00' },
};

// --- USERS ---
export const MOCK_USERS: User[] = [
  // Admin
  { id: 'usr-admin', username: 'admin@workforce.com', name: 'Admin Geral', password: 'password', isGlobalAdmin: true, notifications: [] },
  
  // Company Admins
  { id: 'usr-ca1', username: 'coordenacao@carrocao.com', name: 'Mariana Silva', password: 'password', companyIds: ['1'], rolesByCompany: { '1': 'company-admin' }, statusByCompany: { '1': 'active' }, notifications: [], profilePictureUrl: 'https://i.pravatar.cc/150?u=mariana' },
  { id: 'usr-ca2', username: 'gerencia@acampark.com.br', name: 'João Pereira', password: 'password', companyIds: ['2'], rolesByCompany: { '2': 'company-admin' }, statusByCompany: { '2': 'active' }, notifications: [], profilePictureUrl: 'https://i.pravatar.cc/150?u=joao' },

  // Users
  { id: 'usr-user1', username: 'fernando@email.com', name: 'Fernando Lima', password: 'password', dailyRate: 150, companyIds: ['1', '2'], rolesByCompany: { '1': 'user', '2': 'user' }, statusByCompany: { '1': 'active', '2': 'active' }, skillsByCompany: { '1': ['MONITOR', 'GUIA'], '2': ['MONITOR'] }, notifications: [], profilePictureUrl: 'https://i.pravatar.cc/150?u=fernando', address: {}, bankDetails: {} },
  { id: 'usr-user2', username: 'beatriz@email.com', name: 'Beatriz Costa', password: 'password', dailyRate: 200, companyIds: ['1'], rolesByCompany: { '1': 'user' }, statusByCompany: { '1': 'active' }, skillsByCompany: { '1': ['COORDENADOR', 'MONITOR'] }, notifications: [], profilePictureUrl: 'https://i.pravatar.cc/150?u=beatriz', address: {}, bankDetails: {} },
  { id: 'usr-user3', username: 'lucas@email.com', name: 'Lucas Martins', password: 'password', dailyRate: 120, companyIds: ['2'], rolesByCompany: { '2': 'user' }, statusByCompany: { '2': 'active' }, skillsByCompany: { '2': ['GUIA', 'MONITOR'] }, notifications: [], profilePictureUrl: 'https://i.pravatar.cc/150?u=lucas', address: {}, bankDetails: {} },
  { id: 'usr-user4', username: 'julia@email.com', name: 'Julia Alves', password: 'password', dailyRate: 150, companyIds: ['1'], rolesByCompany: { '1': 'user' }, statusByCompany: { '1': 'active' }, skillsByCompany: { '1': ['AUXILIAR DE COORDENACAO', 'MONITOR'] }, notifications: [], profilePictureUrl: 'https://i.pravatar.cc/150?u=julia', address: {}, bankDetails: {} },
  { id: 'usr-user5', username: 'inativo@email.com', name: 'Ricardo Souza (Inativo)', password: 'password', dailyRate: 130, companyIds: ['1'], rolesByCompany: { '1': 'user' }, statusByCompany: { '1': 'inactive' }, skillsByCompany: { '1': ['MONITOR'] }, notifications: [], profilePictureUrl: 'https://i.pravatar.cc/150?u=ricardo', address: {}, bankDetails: {} },
  { id: 'usr-user6', username: 'pedro@email.com', name: 'Pedro Rocha', password: 'password', dailyRate: 160, companyIds: ['1', '2'], rolesByCompany: { '1': 'user', '2': 'user' }, statusByCompany: { '1': 'active', '2': 'active' }, skillsByCompany: { '1': ['GUIA', 'MONITOR'], '2': ['GUIA', 'MONITOR'] }, notifications: [], profilePictureUrl: 'https://i.pravatar.cc/150?u=pedro', address: {}, bankDetails: {} },
  { id: 'usr-user7', username: 'camila@email.com', name: 'Camila Santos', password: 'password', dailyRate: 140, companyIds: ['1'], rolesByCompany: { '1': 'user' }, statusByCompany: { '1': 'active' }, skillsByCompany: { '1': ['MONITOR', 'GUIA'] }, notifications: [], profilePictureUrl: 'https://i.pravatar.cc/150?u=camila', address: {}, bankDetails: {} },
  { id: 'usr-user8', username: 'rafael@email.com', name: 'Rafael Oliveira', password: 'password', dailyRate: 220, companyIds: ['1', '2'], rolesByCompany: { '1': 'user', '2': 'user' }, statusByCompany: { '1': 'active', '2': 'active' }, skillsByCompany: { '1': ['MONITOR'], '2': ['MONITOR', 'COORDENADOR'] }, notifications: [], profilePictureUrl: 'https://i.pravatar.cc/150?u=rafael', address: {}, bankDetails: {} },
];

// --- TIMESLOTS & REGISTRATIONS ---
const today = new Date();
const d = (dayOffset: number, hour: number, minute: number = 0) => {
    const date = new Date(today);
    date.setDate(today.getDate() + dayOffset);
    date.setHours(hour, minute, 0, 0);
    return date;
};

export const MOCK_TIMESLOTS: TimeSlot[] = [
     // Day -2 (Past) - Atividade Concluída
     { id: 'ts-past1', startTime: d(-2, 8), endTime: d(-2, 17), job: MOCK_JOBS['j1'], capacity: 4, requiredSkills: ['MONITOR', 'GUIA'] },

     // Day +1 (Amanhã)
     { id: 'ts1', startTime: d(1, 8), endTime: d(1, 17), job: MOCK_JOBS['j1'], capacity: 4, requiredSkills: ['MONITOR', 'GUIA'], color: '#bfdbfe', capacityMode: 'skill', capacityBySkill: { 'MONITOR': 3, 'GUIA': 1 } },
     
     // Day +2
     { id: 'ts2', startTime: d(2, 8, 30), endTime: d(2, 17, 30), job: MOCK_JOBS['j5'], capacity: 3, requiredSkills: ['MONITOR'], color: '#d9f99d' },
     
     // Day +4 - Slot intencionalmente cheio
     { id: 'ts-full', startTime: d(4, 9), endTime: d(4, 18), job: MOCK_JOBS['j5'], capacity: 2, requiredSkills: ['MONITOR'] },

     // Day +5 (Evento Agência) - com vagas pendentes
     { id: 'ts3', startTime: d(5, 9), endTime: d(5, 18), job: MOCK_JOBS['j3'], capacity: 3, requiredSkills: ['GUIA', 'COORDENADOR'], color: '#fde68a', capacityMode: 'skill', capacityBySkill: { 'GUIA': 2, 'COORDENADOR': 1 } },

     // Day +6 - Treinamento
     { id: 'ts-j8', startTime: d(6, 9), endTime: d(6, 17), job: MOCK_JOBS['j8'], capacity: 4, requiredSkills: ['MONITOR', 'AUXILIAR DE COORDENACAO'] },

     // Day +10 a +12 (Acampamento de Imersão) - Agrupado
     { id: 'ts-g1-1', startTime: d(10, 8), endTime: d(10, 22), job: MOCK_JOBS['j4'], capacity: 4, requiredSkills: ['MONITOR', 'COORDENADOR'] },
     { id: 'ts-g1-2', startTime: d(11, 8), endTime: d(11, 22), job: MOCK_JOBS['j4'], capacity: 4, requiredSkills: ['MONITOR', 'COORDENADOR'] },
     { id: 'ts-g1-3', startTime: d(12, 8), endTime: d(12, 18), job: MOCK_JOBS['j4'], capacity: 4, requiredSkills: ['MONITOR', 'COORDENADOR'] },

     // Day +15 a +21 (Temporada de Férias Julho) - Agrupado
     { id: 'ts-g2-1', startTime: d(15, 9), endTime: d(15, 22), job: MOCK_JOBS['j2'], capacity: 4, requiredSkills: ['MONITOR', 'GUIA', 'COORDENADOR', 'AUXILIAR DE COORDENACAO'] },
     { id: 'ts-g2-2', startTime: d(16, 9), endTime: d(16, 22), job: MOCK_JOBS['j2'], capacity: 4, requiredSkills: ['MONITOR', 'GUIA', 'COORDENADOR', 'AUXILIAR DE COORDENACAO'] },
     { id: 'ts-g2-3', startTime: d(17, 9), endTime: d(17, 22), job: MOCK_JOBS['j2'], capacity: 4, requiredSkills: ['MONITOR', 'GUIA', 'COORDENADOR', 'AUXILIAR DE COORDENACAO'] },
     { id: 'ts-g2-4', startTime: d(18, 9), endTime: d(18, 22), job: MOCK_JOBS['j2'], capacity: 4, requiredSkills: ['MONITOR', 'GUIA', 'COORDENADOR', 'AUXILIAR DE COORDENACAO'] },
     { id: 'ts-g2-5', startTime: d(19, 9), endTime: d(19, 22), job: MOCK_JOBS['j2'], capacity: 4, requiredSkills: ['MONITOR', 'GUIA', 'COORDENADOR', 'AUXILIAR DE COORDENACAO'] },
     { id: 'ts-g2-6', startTime: d(20, 9), endTime: d(20, 22), job: MOCK_JOBS['j2'], capacity: 4, requiredSkills: ['MONITOR', 'GUIA', 'COORDENADOR', 'AUXILIAR DE COORDENACAO'] },
     { id: 'ts-g2-7', startTime: d(21, 9), endTime: d(21, 14), job: MOCK_JOBS['j2'], capacity: 4, requiredSkills: ['MONITOR', 'GUIA', 'COORDENADOR', 'AUXILIAR DE COORDENACAO'] },

     // Day +20 - Outro Day Use
     { id: 'ts-future1', startTime: d(20, 8), endTime: d(20, 17), job: MOCK_JOBS['j1'], capacity: 3, requiredSkills: ['MONITOR'], color: '#fca5a5' },
     
     // Day +25 - Festa Junina
     { id: 'ts-j6', startTime: d(25, 10), endTime: d(25, 20), job: MOCK_JOBS['j6'], capacity: 4, requiredSkills: ['MONITOR'], capacityMode: 'skill', capacityBySkill: { 'MONITOR': 4 } },

     // Day +30 a +34 (Temporada de Férias Verão)
     { id: 'ts-g3-1', startTime: d(30, 9), endTime: d(30, 22), job: MOCK_JOBS['j7'], capacity: 4, requiredSkills: ['MONITOR', 'COORDENADOR'] },
     { id: 'ts-g3-2', startTime: d(31, 9), endTime: d(31, 22), job: MOCK_JOBS['j7'], capacity: 4, requiredSkills: ['MONITOR', 'COORDENADOR'] },
     { id: 'ts-g3-3', startTime: d(32, 9), endTime: d(32, 22), job: MOCK_JOBS['j7'], capacity: 4, requiredSkills: ['MONITOR', 'COORDENADOR'] },
     { id: 'ts-g3-4', startTime: d(33, 9), endTime: d(33, 22), job: MOCK_JOBS['j7'], capacity: 4, requiredSkills: ['MONITOR', 'COORDENADOR'] },
     { id: 'ts-g3-5', startTime: d(34, 9), endTime: d(34, 14), job: MOCK_JOBS['j7'], capacity: 4, requiredSkills: ['MONITOR', 'COORDENADOR'] },
];

const users = {
    fernando: MOCK_USERS.find(u => u.id === 'usr-user1')!,
    beatriz: MOCK_USERS.find(u => u.id === 'usr-user2')!,
    lucas: MOCK_USERS.find(u => u.id === 'usr-user3')!,
    julia: MOCK_USERS.find(u => u.id === 'usr-user4')!,
    ricardo: MOCK_USERS.find(u => u.id === 'usr-user5')!,
    pedro: MOCK_USERS.find(u => u.id === 'usr-user6')!,
    camila: MOCK_USERS.find(u => u.id === 'usr-user7')!,
    rafael: MOCK_USERS.find(u => u.id === 'usr-user8')!,
};

const slots = {
    tsPast1: MOCK_TIMESLOTS.find(t => t.id === 'ts-past1')!,
    ts1: MOCK_TIMESLOTS.find(t => t.id === 'ts1')!,
    ts2: MOCK_TIMESLOTS.find(t => t.id === 'ts2')!,
    ts3: MOCK_TIMESLOTS.find(t => t.id === 'ts3')!,
    ts_g1_1: MOCK_TIMESLOTS.find(t => t.id === 'ts-g1-1')!,
    ts_full: MOCK_TIMESLOTS.find(t => t.id === 'ts-full')!,
    ts_j6: MOCK_TIMESLOTS.find(t => t.id === 'ts-j6')!,
    ts_j8: MOCK_TIMESLOTS.find(t => t.id === 'ts-j8')!,
    ts_future1: MOCK_TIMESLOTS.find(t => t.id === 'ts-future1')!,
};

const createGroupedRegistrations = (
    baseId: string, 
    job: Job, 
    slots: TimeSlot[], 
    user: User, 
    status: 'pending' | 'approved',
    comment?: string,
    needsTransportation?: boolean,
    transportationNotes?: string,
    registeredWithSkill?: string
): Registration[] => {
    return slots.map((slot, index) => ({
        id: `${baseId}-${index}`,
        slotId: slot.id,
        job: job,
        startTime: slot.startTime,
        endTime: slot.endTime,
        user: user,
        status: status,
        comment: comment,
        needsTransportation,
        transportationNotes,
        registeredWithSkill
    }));
};


const existingRegistrations: Registration[] = [
    // Approved
    { id: 'reg-past', slotId: slots.tsPast1.id, job: slots.tsPast1.job, startTime: slots.tsPast1.startTime, endTime: slots.tsPast1.endTime, user: users.fernando, status: 'approved', comment: 'Ótimo trabalho na atividade anterior.', registeredWithSkill: 'MONITOR' },
    { id: 'reg1', slotId: slots.ts1.id, job: slots.ts1.job, startTime: slots.ts1.startTime, endTime: slots.ts1.endTime, user: users.fernando, status: 'approved', comment: 'Aprovado para a vaga de monitor.', registeredWithSkill: 'MONITOR' },
    { id: 'reg2', slotId: slots.ts1.id, job: slots.ts1.job, startTime: slots.ts1.startTime, endTime: slots.ts1.endTime, user: users.pedro, status: 'approved', comment: 'Aprovado para a vaga de guia.', registeredWithSkill: 'GUIA' },
    
    // Pending
    { id: 'reg-pending1', slotId: slots.ts3.id, job: slots.ts3.job, startTime: slots.ts3.startTime, endTime: slots.ts3.endTime, user: users.beatriz, status: 'pending' }, // Beatriz (COORDENADOR)
    { id: 'reg-pending2', slotId: slots.ts3.id, job: slots.ts3.job, startTime: slots.ts3.startTime, endTime: slots.ts3.endTime, user: users.fernando, status: 'pending' }, // Fernando (GUIA)
];

const newRegistrations: Registration[] = [
    // More pending for Day Use (ts1)
    { id: 'reg-pending4', slotId: slots.ts1.id, job: slots.ts1.job, startTime: slots.ts1.startTime, endTime: slots.ts1.endTime, user: users.julia, status: 'pending' },
    { id: 'reg-pending5', slotId: slots.ts1.id, job: slots.ts1.job, startTime: slots.ts1.startTime, endTime: slots.ts1.endTime, user: users.camila, status: 'pending' },

    // Registrations to fill up a slot (ts-full)
    { id: 'reg-full1', slotId: slots.ts_full.id, job: slots.ts_full.job, startTime: slots.ts_full.startTime, endTime: slots.ts_full.endTime, user: users.lucas, status: 'approved', registeredWithSkill: 'MONITOR' },
    { id: 'reg-full2', slotId: slots.ts_full.id, job: slots.ts_full.job, startTime: slots.ts_full.startTime, endTime: slots.ts_full.endTime, user: users.pedro, status: 'approved', registeredWithSkill: 'MONITOR' },

    // Registrations for new activities
    { id: 'reg-j6-1', slotId: slots.ts_j6.id, job: slots.ts_j6.job, startTime: slots.ts_j6.startTime, endTime: slots.ts_j6.endTime, user: users.camila, status: 'pending', needsTransportation: false },
    { id: 'reg-j8-1', slotId: slots.ts_j8.id, job: slots.ts_j8.job, startTime: slots.ts_j8.startTime, endTime: slots.ts_j8.endTime, user: users.fernando, status: 'approved', needsTransportation: true, transportationNotes: 'Preciso de carona', registeredWithSkill: 'MONITOR' },
    { id: 'reg-j8-2', slotId: slots.ts_j8.id, job: slots.ts_j8.job, startTime: slots.ts_j8.startTime, endTime: slots.ts_j8.endTime, user: users.julia, status: 'pending', needsTransportation: false },

    // Registrations for grouped activities
    // Acampamento de Imersão em Inglês (j4)
    ...createGroupedRegistrations('reg-g1-1', MOCK_JOBS['j4'], MOCK_TIMESLOTS.filter(t => t.job.id === 'j4'), users.julia, 'pending'),
    ...createGroupedRegistrations('reg-g1-2', MOCK_JOBS['j4'], MOCK_TIMESLOTS.filter(t => t.job.id === 'j4'), users.beatriz, 'approved', 'Aprovada como coordenadora', undefined, undefined, 'COORDENADOR'),

    // Temporada de Férias Julho (j2)
    ...createGroupedRegistrations('reg-g2-1', MOCK_JOBS['j2'], MOCK_TIMESLOTS.filter(t => t.job.id === 'j2'), users.rafael, 'pending'),
    ...createGroupedRegistrations('reg-g2-2', MOCK_JOBS['j2'], MOCK_TIMESLOTS.filter(t => t.job.id === 'j2'), users.lucas, 'approved', 'Aprovado como guia', undefined, undefined, 'GUIA'),
    
    // Temporada de Férias Verão (j7)
    ...createGroupedRegistrations('reg-g3-1', MOCK_JOBS['j7'], MOCK_TIMESLOTS.filter(t => t.job.id === 'j7'), users.pedro, 'pending'),
    ...createGroupedRegistrations('reg-g3-2', MOCK_JOBS['j7'], MOCK_TIMESLOTS.filter(t => t.job.id === 'j7'), users.rafael, 'approved', 'Aprovado como coordenador', undefined, undefined, 'COORDENADOR'),
];

const carrocao_extra_registrations: Registration[] = [
    // Add more pending for Day Use (ts1)
    { id: 'reg-extra-ts1-1', slotId: slots.ts1.id, job: slots.ts1.job, startTime: slots.ts1.startTime, endTime: slots.ts1.endTime, user: users.beatriz, status: 'pending' },

    // Add a lot more pending for Festa Junina (ts-j6) to test AI
    { id: 'reg-extra-j6-1', slotId: slots.ts_j6.id, job: slots.ts_j6.job, startTime: slots.ts_j6.startTime, endTime: slots.ts_j6.endTime, user: users.fernando, status: 'pending', needsTransportation: true, transportationNotes: 'Bus stop near home' },
    { id: 'reg-extra-j6-2', slotId: slots.ts_j6.id, job: slots.ts_j6.job, startTime: slots.ts_j6.startTime, endTime: slots.ts_j6.endTime, user: users.beatriz, status: 'pending' },
    { id: 'reg-extra-j6-3', slotId: slots.ts_j6.id, job: slots.ts_j6.job, startTime: slots.ts_j6.startTime, endTime: slots.ts_j6.endTime, user: users.julia, status: 'pending' },
    { id: 'reg-extra-j6-4', slotId: slots.ts_j6.id, job: slots.ts_j6.job, startTime: slots.ts_j6.startTime, endTime: slots.ts_j6.endTime, user: users.pedro, status: 'pending' },
    { id: 'reg-extra-j6-5', slotId: slots.ts_j6.id, job: slots.ts_j6.job, startTime: slots.ts_j6.startTime, endTime: slots.ts_j6.endTime, user: users.rafael, status: 'pending', needsTransportation: true },
    
    // Add more pending for Treinamento de Monitores (ts-j8)
    { id: 'reg-extra-j8-1', slotId: slots.ts_j8.id, job: slots.ts_j8.job, startTime: slots.ts_j8.startTime, endTime: slots.ts_j8.endTime, user: users.beatriz, status: 'pending' },
    { id: 'reg-extra-j8-2', slotId: slots.ts_j8.id, job: slots.ts_j8.job, startTime: slots.ts_j8.startTime, endTime: slots.ts_j8.endTime, user: users.camila, status: 'pending', needsTransportation: true },
    { id: 'reg-extra-j8-3', slotId: slots.ts_j8.id, job: slots.ts_j8.job, startTime: slots.ts_j8.startTime, endTime: slots.ts_j8.endTime, user: users.pedro, status: 'pending' },
];

const additional_mock_registrations: Registration[] = [
    // 1. More pending for ts2 (ACAMPARK Day Use, requires MONITOR)
    // Fernando and Pedro have MONITOR for ACAMPARK.
    { id: 'reg-add-ts2-1', slotId: slots.ts2.id, job: slots.ts2.job, startTime: slots.ts2.startTime, endTime: slots.ts2.endTime, user: users.fernando, status: 'pending' },
    { id: 'reg-add-ts2-2', slotId: slots.ts2.id, job: slots.ts2.job, startTime: slots.ts2.startTime, endTime: slots.ts2.endTime, user: users.pedro, status: 'pending', needsTransportation: true, transportationNotes: 'Preciso de carona do terminal.' },

    // 2. More approved for ts-j8 (CARROÇÃO Treinamento, requires MONITOR, AUXILIAR DE COORDENACAO)
    // Let's add Rafael as approved with MONITOR skill.
    { id: 'reg-add-j8-1', slotId: slots.ts_j8.id, job: slots.ts_j8.job, startTime: slots.ts_j8.startTime, endTime: slots.ts_j8.endTime, user: users.rafael, status: 'approved', registeredWithSkill: 'MONITOR' },

    // 3. More for grouped activity j2 (ACAMPARK Temporada Férias)
    // Let's add Fernando (pending, has MONITOR, GUIA).
    ...createGroupedRegistrations('reg-add-g2-1', MOCK_JOBS['j2'], MOCK_TIMESLOTS.filter(t => t.job.id === 'j2'), users.fernando, 'pending'),

    // 4. For grouped activity j7 (ACAMPARK Temporada Verão, requires MONITOR, COORDENADOR)
    // Let's add Camila (pending). She does not have skills for ACAMPARK. This is a good test.
    ...createGroupedRegistrations('reg-add-g3-3', MOCK_JOBS['j7'], MOCK_TIMESLOTS.filter(t => t.job.id === 'j7'), users.camila, 'pending'),

    // 5. Add some registrations for a slot that has no registrations yet.
    // `ts-future1` (CARROÇÃO, Day Use, requires MONITOR)
    { id: 'reg-add-fut1-1', slotId: slots.ts_future1.id, job: slots.ts_future1.job, startTime: slots.ts_future1.startTime, endTime: slots.ts_future1.endTime, user: users.beatriz, status: 'pending' },
    { id: 'reg-add-fut1-2', slotId: slots.ts_future1.id, job: slots.ts_future1.job, startTime: slots.ts_future1.startTime, endTime: slots.ts_future1.endTime, user: users.julia, status: 'pending' },
];

export const MOCK_REGISTRATIONS: Registration[] = [...existingRegistrations, ...newRegistrations, ...carrocao_extra_registrations, ...additional_mock_registrations];

export const MOCK_AUDIT_LOGS: AuditLog[] = [];