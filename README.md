# Personal Gemini Journal

A secure AI journaling web application built with Next.js 14, Firebase Authentication, Cloud Firestore, Google Gen AI SDK (`@google/genai`), and Cloud Run.

## Local Development Setup

1. **Prerequisites**: Node.js v18+, `npm`, Google Cloud SDK (`gcloud`).
2. **Environment Variables**: Copy `.env.example` to `.env.local` and populate your Firebase project configuration values.
3. **Application Default Credentials (ADC)**: Run:
   ```bash
   gcloud auth application-default login
   ```
   Do **NOT** download or store any service account key JSON files. The server uses Application Default Credentials.
4. **Deploy Firestore Rules**:
   ```bash
   firebase deploy --only firestore:rules
   ```
5. **Install Dependencies**:
   ```bash
   npm install
   ```
6. **Run Development Server**:
   ```bash
   npm run dev
   ```

## Configuration Architecture

### PUBLIC BUILD-TIME CONFIG
`NEXT_PUBLIC_FIREBASE_*` values are public Firebase Web App configuration items. They must be supplied during the Next.js build stage (e.g. `--set-build-env-vars` in Cloud Run or Docker build args) because Next.js statically inlines `NEXT_PUBLIC_*` variables into the client bundle at build time.

### SECRET RUNTIME CONFIG
`GEMINI_API_KEY` is a real secret and is supplied only at Cloud Run runtime from Google Cloud Secret Manager:
- Secret: `gemini-api-key`
- Pinned Version: `1` (`gemini-api-key:1`)

Never mix these two categories:
- DO NOT put `GEMINI_API_KEY` into Docker build args or `NEXT_PUBLIC_*` variables.
- Pass `NEXT_PUBLIC_FIREBASE_*` variables at build time so browser bundles configure Firebase correctly without placeholder fallbacks.

## Cloud Run Deployment

```bash
# 1. Create Dedicated Runtime Service Account
gcloud iam service-accounts create journal-runner --display-name="Personal Gemini Journal Runner"

# 2. Grant Least-Privilege IAM Roles
gcloud projects add-iam-policy-binding geminijournal-507414 \
  --member="serviceAccount:journal-runner@geminijournal-507414.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding geminijournal-507414 \
  --member="serviceAccount:journal-runner@geminijournal-507414.iam.gserviceaccount.com" \
  --role="roles/firebaseauth.viewer"

# 3. Deploy to Cloud Run with Build-Time and Runtime Configuration
gcloud run deploy personal-gemini-journal \
  --project geminijournal-507414 \
  --region us-central1 \
  --source . \
  --service-account journal-runner@geminijournal-507414.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=gemini-api-key:1 \
  --set-build-env-vars NEXT_PUBLIC_FIREBASE_PROJECT_ID=geminijournal-507414,NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=geminijournal-507414.firebaseapp.com,NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=geminijournal-507414.firebasestorage.app,NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=426042943892,NEXT_PUBLIC_FIREBASE_APP_ID=1:426042943892:web:d998cea32570cabd6f0781 \
  --set-env-vars NEXT_PUBLIC_FIREBASE_PROJECT_ID=geminijournal-507414,NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=geminijournal-507414.firebaseapp.com,NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=geminijournal-507414.firebasestorage.app,NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=426042943892,NEXT_PUBLIC_FIREBASE_APP_ID=1:426042943892:web:d998cea32570cabd6f0781
```
