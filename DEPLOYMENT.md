# Deployment Instructions for Wakulima Smart Stock

## Frontend Deployment to Vercel

1. Ensure you have the Vercel CLI available (installed locally in the project):
   ```bash
   npx vercel --version
   ```

2. Log in to your Vercel account:
   ```bash
   npx vercel login
   ```

3. From the project root directory, run the following command to deploy:
   ```bash
   npx vercel --prod
   ```

   This will use the `vercel.json` configuration file to build and deploy the frontend.

4. Alternatively, you can connect your GitHub repository to Vercel and enable automatic deployments on push to main branch.

---

## Supabase Migrations Deployment

1. Ensure you have the Supabase CLI available (installed locally in the project):
   ```bash
   npx supabase --version
   ```

2. Log in to your Supabase account:
   ```bash
   npx supabase login
   ```

3. Navigate to the `supabase` directory in your project:
   ```bash
   cd supabase
   ```

4. Deploy the migrations to your remote Supabase project:
   ```bash
   npx supabase db push
   ```

   This will apply all pending migrations to your remote database.

---

## Notes

- Make sure your `supabase/config.toml` is correctly configured with your Supabase project ID.
- Verify that your environment variables for Supabase keys are set in Vercel for the frontend to connect properly.
- After deployment, test the application to confirm everything is working as expected.
