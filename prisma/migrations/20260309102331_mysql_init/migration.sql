-- CreateTable
CREATE TABLE `Company` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `phone1` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `contactName` VARCHAR(191) NULL,
    `contractType` VARCHAR(191) NULL,
    `contractValue` DOUBLE NULL,
    `bannerImageUrl` VARCHAR(191) NULL,
    `defaultStartTime` VARCHAR(191) NULL,
    `defaultEndTime` VARCHAR(191) NULL,
    `maxMonthlyHiresPerUser` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Skill` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Job` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `isGrouped` BOOLEAN NOT NULL DEFAULT false,
    `hideTitleFromUser` BOOLEAN NOT NULL DEFAULT false,
    `offersTransportation` BOOLEAN NOT NULL DEFAULT false,
    `transportationDepartureLocation` VARCHAR(191) NULL,
    `transportationDepartureTime` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `isGlobalAdmin` BOOLEAN NOT NULL DEFAULT false,
    `dailyRate` DOUBLE NULL,
    `profilePictureUrl` VARCHAR(191) NULL,
    `address` JSON NULL,
    `bankDetails` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserCompany` (
    `userId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'user',
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `skills` JSON NULL,

    PRIMARY KEY (`userId`, `companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TimeSlot` (
    `id` VARCHAR(191) NOT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `capacity` INTEGER NOT NULL,
    `requiredSkills` JSON NULL,
    `color` VARCHAR(191) NULL,
    `capacityMode` VARCHAR(191) NOT NULL DEFAULT 'total',
    `capacityBySkill` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Registration` (
    `id` VARCHAR(191) NOT NULL,
    `slotId` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `comment` TEXT NULL,
    `needsTransportation` BOOLEAN NOT NULL DEFAULT false,
    `transportationNotes` TEXT NULL,
    `registeredWithSkill` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Registration_userId_slotId_key`(`userId`, `slotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `details` TEXT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Skill` ADD CONSTRAINT `Skill_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Job` ADD CONSTRAINT `Job_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCompany` ADD CONSTRAINT `UserCompany_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCompany` ADD CONSTRAINT `UserCompany_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimeSlot` ADD CONSTRAINT `TimeSlot_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Registration` ADD CONSTRAINT `Registration_slotId_fkey` FOREIGN KEY (`slotId`) REFERENCES `TimeSlot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Registration` ADD CONSTRAINT `Registration_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Registration` ADD CONSTRAINT `Registration_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed Data

-- Companies
INSERT INTO `Company` (`id`, `name`, `address`, `city`, `state`, `phone1`, `email`, `contactName`, `contractType`, `contractValue`, `bannerImageUrl`, `defaultStartTime`, `defaultEndTime`, `maxMonthlyHiresPerUser`, `updatedAt`) VALUES
('1', 'CARROÇÃO', 'Rod. SP-340, Km 128.5', 'Mogi Mirim', 'SP', '19-3805-7200', 'contato@carrocao.com', 'Mariana Silva', 'anual', 250000, 'https://images.seeklogo.com/logo-png/39/1/sitio-do-carrocao-logo-png_seeklogo-395715.png', '08:00', '17:00', 5, NOW(3)),
('2', 'ACAMPARK', 'Estr. do Rio Acima, 4411', 'Mairiporã', 'SP', '11-4485-1229', 'contato@acampark.com.br', 'João Pereira', 'monthly', 20000, 'https://www.promoventos.com.br/wp-content/uploads/2023/09/logo-acampark.png', '09:00', '18:00', 3, NOW(3)),
('3', 'AGENCIA QUALQUER', 'Av. Paulista, 1000', 'São Paulo', 'SP', '11-99999-8888', 'eventos@agenciaqualquer.com', 'Carlos Andrade', 'other', 5000, NULL, NULL, NULL, NULL, NOW(3));

-- Skills
INSERT INTO `Skill` (`id`, `name`, `companyId`, `updatedAt`) VALUES
('sk1', 'MONITOR', '1', NOW(3)),
('sk2', 'GUIA', '1', NOW(3)),
('sk3', 'AUXILIAR DE COORDENACAO', '1', NOW(3)),
('sk4', 'COORDENADOR', '1', NOW(3)),
('sk5', 'MONITOR', '2', NOW(3)),
('sk6', 'GUIA', '2', NOW(3)),
('sk7', 'COORDENADOR', '2', NOW(3));

-- Users
INSERT INTO `User` (`id`, `username`, `name`, `password`, `isGlobalAdmin`, `dailyRate`, `profilePictureUrl`, `address`, `bankDetails`, `updatedAt`) VALUES
('usr-admin', 'admin@workforce.com', 'Admin Geral', 'password', true, NULL, NULL, '{}', '{}', NOW(3)),
('usr-ca1', 'coordenacao@carrocao.com', 'Mariana Silva', 'password', false, NULL, 'https://i.pravatar.cc/150?u=mariana', '{}', '{}', NOW(3)),
('usr-ca2', 'gerencia@acampark.com.br', 'João Pereira', 'password', false, NULL, 'https://i.pravatar.cc/150?u=joao', '{}', '{}', NOW(3)),
('usr-user1', 'fernando@email.com', 'Fernando Lima', 'password', false, 150, 'https://i.pravatar.cc/150?u=fernando', '{}', '{}', NOW(3)),
('usr-user2', 'beatriz@email.com', 'Beatriz Costa', 'password', false, 200, 'https://i.pravatar.cc/150?u=beatriz', '{}', '{}', NOW(3)),
('usr-user3', 'lucas@email.com', 'Lucas Martins', 'password', false, 120, 'https://i.pravatar.cc/150?u=lucas', '{}', '{}', NOW(3)),
('usr-user4', 'julia@email.com', 'Julia Alves', 'password', false, 150, 'https://i.pravatar.cc/150?u=julia', '{}', '{}', NOW(3)),
('usr-user5', 'inativo@email.com', 'Ricardo Souza (Inativo)', 'password', false, 130, 'https://i.pravatar.cc/150?u=ricardo', '{}', '{}', NOW(3)),
('usr-user6', 'pedro@email.com', 'Pedro Rocha', 'password', false, 160, 'https://i.pravatar.cc/150?u=pedro', '{}', '{}', NOW(3)),
('usr-user7', 'camila@email.com', 'Camila Santos', 'password', false, 140, 'https://i.pravatar.cc/150?u=camila', '{}', '{}', NOW(3)),
('usr-user8', 'rafael@email.com', 'Rafael Oliveira', 'password', false, 220, 'https://i.pravatar.cc/150?u=rafael', '{}', '{}', NOW(3));

-- UserCompany
INSERT INTO `UserCompany` (`userId`, `companyId`, `role`, `status`, `skills`) VALUES
('usr-ca1', '1', 'company-admin', 'active', NULL),
('usr-ca2', '2', 'company-admin', 'active', NULL),
('usr-user1', '1', 'user', 'active', '["MONITOR", "GUIA"]'),
('usr-user1', '2', 'user', 'active', '["MONITOR"]'),
('usr-user2', '1', 'user', 'active', '["COORDENADOR", "MONITOR"]'),
('usr-user3', '2', 'user', 'active', '["GUIA", "MONITOR"]'),
('usr-user4', '1', 'user', 'active', '["AUXILIAR DE COORDENACAO", "MONITOR"]'),
('usr-user5', '1', 'user', 'inactive', '["MONITOR"]'),
('usr-user6', '1', 'user', 'active', '["GUIA", "MONITOR"]'),
('usr-user6', '2', 'user', 'active', '["GUIA", "MONITOR"]'),
('usr-user7', '1', 'user', 'active', '["MONITOR", "GUIA"]'),
('usr-user8', '1', 'user', 'active', '["MONITOR"]'),
('usr-user8', '2', 'user', 'active', '["MONITOR", "COORDENADOR"]');

-- Jobs
INSERT INTO `Job` (`id`, `title`, `description`, `location`, `companyId`, `isGrouped`, `hideTitleFromUser`, `offersTransportation`, `transportationDepartureLocation`, `transportationDepartureTime`, `updatedAt`) VALUES
('j1', 'Day Use - Colégio Saber', 'Atividade de um dia para os alunos do 6º ano do Colégio Saber. Necessário monitores para acompanhar os grupos nas trilhas e atividades aquáticas.', 'Sede Carroção', '1', false, false, false, NULL, NULL, NOW(3)),
('j2', 'Temporada de Férias Julho', 'Temporada de férias de uma semana para crianças de 10 a 14 anos. Vagas para todas as funções.', 'Sede Acampark', '2', true, false, false, NULL, NULL, NOW(3)),
('j3', 'Evento Corporativo', 'Evento de team building para empresa cliente. Necessário guias e coordenador.', 'Sede Carroção', '3', false, true, false, NULL, NULL, NOW(3)),
('j4', 'Acampamento de Imersão em Inglês', 'Acampamento de 3 dias com foco em inglês. Monitores fluentes são um diferencial.', 'Sede Carroção', '1', true, false, false, NULL, NULL, NOW(3)),
('j5', 'Day Use - Escola Crescer', 'Atividade de um dia com foco em educação ambiental para o 4º ano.', 'Sede Acampark', '2', false, false, false, NULL, NULL, NOW(3)),
('j6', 'Festa Junina - Escola Aprender', 'Grande evento de Festa Junina para a Escola Aprender. Monitores para barracas e gincanas.', 'Sede Carroção', '1', false, false, false, NULL, NULL, NOW(3)),
('j7', 'Temporada de Férias de Verão', 'Temporada de 5 dias para adolescentes. Muitas atividades aquáticas e jogos noturnos.', 'Sede Acampark', '2', true, false, false, NULL, NULL, NOW(3)),
('j8', 'Treinamento de Monitores', 'Treinamento interno para novos monitores. Foco em segurança e recreação.', 'Sede Carroção', '1', false, false, true, 'Metrô Tatuapé', '07:00', NOW(3));

-- TimeSlots
INSERT INTO `TimeSlot` (`id`, `startTime`, `endTime`, `jobId`, `capacity`, `requiredSkills`, `color`, `capacityMode`, `capacityBySkill`, `updatedAt`) VALUES
('ts-past1', DATE_SUB(NOW(3), INTERVAL 2 DAY), DATE_SUB(NOW(3), INTERVAL 2 DAY), 'j1', 4, '["MONITOR", "GUIA"]', NULL, 'total', NULL, NOW(3)),
('ts1', DATE_ADD(NOW(3), INTERVAL 1 DAY), DATE_ADD(NOW(3), INTERVAL 1 DAY), 'j1', 4, '["MONITOR", "GUIA"]', '#bfdbfe', 'skill', '{"MONITOR": 3, "GUIA": 1}', NOW(3)),
('ts2', DATE_ADD(NOW(3), INTERVAL 2 DAY), DATE_ADD(NOW(3), INTERVAL 2 DAY), 'j5', 3, '["MONITOR"]', '#d9f99d', 'total', NULL, NOW(3)),
('ts-full', DATE_ADD(NOW(3), INTERVAL 4 DAY), DATE_ADD(NOW(3), INTERVAL 4 DAY), 'j5', 2, '["MONITOR"]', NULL, 'total', NULL, NOW(3)),
('ts3', DATE_ADD(NOW(3), INTERVAL 5 DAY), DATE_ADD(NOW(3), INTERVAL 5 DAY), 'j3', 3, '["GUIA", "COORDENADOR"]', '#fde68a', 'skill', '{"GUIA": 2, "COORDENADOR": 1}', NOW(3)),
('ts-j8', DATE_ADD(NOW(3), INTERVAL 6 DAY), DATE_ADD(NOW(3), INTERVAL 6 DAY), 'j8', 4, '["MONITOR", "AUXILIAR DE COORDENACAO"]', NULL, 'total', NULL, NOW(3)),
('ts-g1-1', DATE_ADD(NOW(3), INTERVAL 10 DAY), DATE_ADD(NOW(3), INTERVAL 10 DAY), 'j4', 4, '["MONITOR", "COORDENADOR"]', NULL, 'total', NULL, NOW(3)),
('ts-g1-2', DATE_ADD(NOW(3), INTERVAL 11 DAY), DATE_ADD(NOW(3), INTERVAL 11 DAY), 'j4', 4, '["MONITOR", "COORDENADOR"]', NULL, 'total', NULL, NOW(3)),
('ts-g1-3', DATE_ADD(NOW(3), INTERVAL 12 DAY), DATE_ADD(NOW(3), INTERVAL 12 DAY), 'j4', 4, '["MONITOR", "COORDENADOR"]', NULL, 'total', NULL, NOW(3)),
('ts-g2-1', DATE_ADD(NOW(3), INTERVAL 15 DAY), DATE_ADD(NOW(3), INTERVAL 15 DAY), 'j2', 4, '["MONITOR", "GUIA", "COORDENADOR", "AUXILIAR DE COORDENACAO"]', NULL, 'total', NULL, NOW(3)),
('ts-g2-2', DATE_ADD(NOW(3), INTERVAL 16 DAY), DATE_ADD(NOW(3), INTERVAL 16 DAY), 'j2', 4, '["MONITOR", "GUIA", "COORDENADOR", "AUXILIAR DE COORDENACAO"]', NULL, 'total', NULL, NOW(3)),
('ts-g2-3', DATE_ADD(NOW(3), INTERVAL 17 DAY), DATE_ADD(NOW(3), INTERVAL 17 DAY), 'j2', 4, '["MONITOR", "GUIA", "COORDENADOR", "AUXILIAR DE COORDENACAO"]', NULL, 'total', NULL, NOW(3)),
('ts-g2-4', DATE_ADD(NOW(3), INTERVAL 18 DAY), DATE_ADD(NOW(3), INTERVAL 18 DAY), 'j2', 4, '["MONITOR", "GUIA", "COORDENADOR", "AUXILIAR DE COORDENACAO"]', NULL, 'total', NULL, NOW(3)),
('ts-g2-5', DATE_ADD(NOW(3), INTERVAL 19 DAY), DATE_ADD(NOW(3), INTERVAL 19 DAY), 'j2', 4, '["MONITOR", "GUIA", "COORDENADOR", "AUXILIAR DE COORDENACAO"]', NULL, 'total', NULL, NOW(3)),
('ts-g2-6', DATE_ADD(NOW(3), INTERVAL 20 DAY), DATE_ADD(NOW(3), INTERVAL 20 DAY), 'j2', 4, '["MONITOR", "GUIA", "COORDENADOR", "AUXILIAR DE COORDENACAO"]', NULL, 'total', NULL, NOW(3)),
('ts-g2-7', DATE_ADD(NOW(3), INTERVAL 21 DAY), DATE_ADD(NOW(3), INTERVAL 21 DAY), 'j2', 4, '["MONITOR", "GUIA", "COORDENADOR", "AUXILIAR DE COORDENACAO"]', NULL, 'total', NULL, NOW(3)),
('ts-future1', DATE_ADD(NOW(3), INTERVAL 20 DAY), DATE_ADD(NOW(3), INTERVAL 20 DAY), 'j1', 3, '["MONITOR"]', '#fca5a5', 'total', NULL, NOW(3)),
('ts-j6', DATE_ADD(NOW(3), INTERVAL 25 DAY), DATE_ADD(NOW(3), INTERVAL 25 DAY), 'j6', 4, '["MONITOR"]', NULL, 'skill', '{"MONITOR": 4}', NOW(3)),
('ts-g3-1', DATE_ADD(NOW(3), INTERVAL 30 DAY), DATE_ADD(NOW(3), INTERVAL 30 DAY), 'j7', 4, '["MONITOR", "COORDENADOR"]', NULL, 'total', NULL, NOW(3)),
('ts-g3-2', DATE_ADD(NOW(3), INTERVAL 31 DAY), DATE_ADD(NOW(3), INTERVAL 31 DAY), 'j7', 4, '["MONITOR", "COORDENADOR"]', NULL, 'total', NULL, NOW(3)),
('ts-g3-3', DATE_ADD(NOW(3), INTERVAL 32 DAY), DATE_ADD(NOW(3), INTERVAL 32 DAY), 'j7', 4, '["MONITOR", "COORDENADOR"]', NULL, 'total', NULL, NOW(3)),
('ts-g3-4', DATE_ADD(NOW(3), INTERVAL 33 DAY), DATE_ADD(NOW(3), INTERVAL 33 DAY), 'j7', 4, '["MONITOR", "COORDENADOR"]', NULL, 'total', NULL, NOW(3)),
('ts-g3-5', DATE_ADD(NOW(3), INTERVAL 34 DAY), DATE_ADD(NOW(3), INTERVAL 34 DAY), 'j7', 4, '["MONITOR", "COORDENADOR"]', NULL, 'total', NULL, NOW(3));

-- Registrations
INSERT INTO `Registration` (`id`, `slotId`, `jobId`, `userId`, `status`, `comment`, `registeredWithSkill`, `updatedAt`) VALUES
('reg-past', 'ts-past1', 'j1', 'usr-user1', 'approved', 'Ótimo trabalho na atividade anterior.', 'MONITOR', NOW(3)),
('reg1', 'ts1', 'j1', 'usr-user1', 'approved', 'Aprovado para a vaga de monitor.', 'MONITOR', NOW(3)),
('reg2', 'ts1', 'j1', 'usr-user6', 'approved', 'Aprovado para a vaga de guia.', 'GUIA', NOW(3)),
('reg-pending1', 'ts3', 'j3', 'usr-user2', 'pending', NULL, NULL, NOW(3)),
('reg-pending2', 'ts3', 'j3', 'usr-user1', 'pending', NULL, NULL, NOW(3)),
('reg-pending4', 'ts1', 'j1', 'usr-user4', 'pending', NULL, NULL, NOW(3)),
('reg-pending5', 'ts1', 'j1', 'usr-user7', 'pending', NULL, NULL, NOW(3)),
('reg-full1', 'ts-full', 'j5', 'usr-user3', 'approved', NULL, 'MONITOR', NOW(3)),
('reg-full2', 'ts-full', 'j5', 'usr-user6', 'approved', NULL, 'MONITOR', NOW(3)),
('reg-j6-1', 'ts-j6', 'j6', 'usr-user7', 'pending', NULL, NULL, NOW(3)),
('reg-j8-1', 'ts-j8', 'j8', 'usr-user1', 'approved', NULL, 'MONITOR', NOW(3)),
('reg-j8-2', 'ts-j8', 'j8', 'usr-user4', 'pending', NULL, NULL, NOW(3));

