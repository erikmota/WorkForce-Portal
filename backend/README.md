# Workforce Backend - Cloud Run Deployment (v1.1 - Prisma 7 Fix)

This is a standalone backend for the Workforce Portal, prepared for deployment to Google Cloud Run.

## Local Development

1.  Navigate to the `backend` directory:
    ```bash
    cd backend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Set up your `.env` file based on `.env.example`.
4.  Generate Prisma client:
    ```bash
    npx prisma generate
    ```
5.  Start the development server:
    ```bash
    npm run dev
    ```

## Cloud Run Deployment

### 1. Build and Push Image to Google Artifact Registry

Replace `[PROJECT_ID]`, `[REGION]`, and `[REPOSITORY]` with your Google Cloud details.

```bash
# Authenticate with Google Cloud
gcloud auth login

# Configure Docker for Artifact Registry
gcloud auth configure-docker [REGION]-docker.pkg.dev

# Build the image
docker build -t [REGION]-docker.pkg.dev/[PROJECT_ID]/[REPOSITORY]/workforce-backend:latest .

# Push the image
docker push [REGION]-docker.pkg.dev/[PROJECT_ID]/[REPOSITORY]/workforce-backend:latest
```

### 2. Deploy to Cloud Run

```bash
gcloud run deploy workforce-backend \
  --image [REGION]-docker.pkg.dev/[PROJECT_ID]/[REPOSITORY]/workforce-backend:latest \
  --platform managed \
  --region [REGION] \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL="mysql://user:password@sistemabd.mysql.dbaas.com.br:3306/database"
```

## Frontend Configuration

Once deployed, copy the Cloud Run URL (e.g., `https://workforce-backend-xyz.a.run.app`) and update the `apiUrl` in `src/environments/environment.ts`:

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://workforce-backend-xyz.a.run.app/api'
};
```
