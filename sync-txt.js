import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filesToWatch = [
  { txt: 'Dockerfile.txt', orig: 'Dockerfile' },
  { txt: 'README.txt', orig: 'README.md' },
  { txt: '.gitignore.txt', orig: '.gitignore' },
  { txt: '.dockerignore.txt', orig: '.dockerignore' },
  { txt: 'backend/Dockerfile.txt', orig: 'backend/Dockerfile' },
  { txt: 'backend/README.txt', orig: 'backend/README.md' },
  { txt: 'backend/.dockerignore.txt', orig: 'backend/.dockerignore' },
  { txt: 'prisma/schema.txt', orig: 'prisma/schema.prisma' },
  { txt: 'backend/prisma/schema.txt', orig: 'backend/prisma/schema.prisma' }
];

console.log('Starting file sync watcher for .txt copies...');

filesToWatch.forEach(({ txt, orig }) => {
  const txtPath = path.join(__dirname, txt);
  const origPath = path.join(__dirname, orig);

  if (fs.existsSync(txtPath)) {
    console.log(`Watching ${txt} -> ${orig}`);
    
    // Watch the .txt file for changes
    fs.watch(txtPath, (eventType) => {
      if (eventType === 'change') {
        try {
          const content = fs.readFileSync(txtPath, 'utf8');
          fs.writeFileSync(origPath, content, 'utf8');
          console.log(`[Sync] Updated ${orig} from ${txt}`);
        } catch (err) {
          console.error(`[Sync Error] Failed to update ${orig}:`, err.message);
        }
      }
    });
  }
});
