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

### 1. Pre-requisites

Ensure the Artifact Registry API is enabled in your project:
```bash
gcloud services enable artifactregistry.googleapis.com
```

### 2. Authenticate and Configure Docker

Replace `[REGION]` with your region (e.g., `us-west1`).

```bash
# Authenticate with Google Cloud
gcloud auth login

# Configure Docker for your specific region's registry
gcloud auth configure-docker [REGION]-docker.pkg.dev
```

### 3. Build and Push Image

Replace `[PROJECT_ID]`, `[REGION]`, and `[REPOSITORY]` with your Google Cloud details.

```bash
# Build the image
docker build -t [REGION]-docker.pkg.dev/[PROJECT_ID]/[REPOSITORY]/workforce-backend:latest .

# Push the image
docker push [REGION]-docker.pkg.dev/[PROJECT_ID]/[REPOSITORY]/workforce-backend:latest
```

## Deployment Alternatives (Recommended)

### Method A: Google Cloud Builds (Most Reliable)

If `docker push` continues to fail with "connection refused", use **Cloud Builds**. This method sends your source code to Google Cloud and builds/pushes the image entirely on Google's infrastructure, bypassing local network issues.

1.  **Enable Cloud Build API:**
    ```bash
    gcloud services enable cloudbuild.googleapis.com
    ```

2.  **Submit the Build:**
    Run this command from inside the `backend` folder:
    ```bash
    gcloud builds submit --tag us-west1-docker.pkg.dev/workforce-portal-472121/workforce-portal-repository/workforce-backend:latest .
    ```

### Method B: Troubleshooting Docker Push

If you must use `docker push`:

1.  **Check Project Quotas:** Ensure your billing is active and you haven't hit Artifact Registry quotas.
2.  **Test Connectivity:** Run `curl -v https://us-west1-docker.pkg.dev/v2/` to see if you can reach the endpoint.
3.  **Docker Login (Direct):**
    ```bash
    gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin https://us-west1-docker.pkg.dev
    ```

### 2. Deploy to Cloud Run

```bash
gcloud run deploy workforce-backend \
  --image [REGION]-docker.pkg.dev/[PROJECT_ID]/[REPOSITORY]/workforce-backend:latest \
  --platform managed \
  --region [REGION] \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL="mysql://sistemabd:Abc123@@sistemabd.mysql.dbaas.com.br:3306/sistemabd"
```

## Frontend Configuration

Once deployed, copy the Cloud Run URL (e.g., `https://workforce-backend-xyz.a.run.app`) and update the `apiUrl` in `src/environments/environment.ts`:

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://workforce-backend-xyz.a.run.app/api'
};
```
