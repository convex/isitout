# Is it out

Is it out is an app built on Convex and used by Convex engineers to see the version
history of each of our internal services.

## Local Development Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up Convex**
   ```bash
   npx convex dev
   ```
   This creates a new development deployment. Copy all environment variables from the production `isitout` deployment in the [Convex team dashboard](https://dashboard.convex.dev).

3. **Configure Google OAuth**
   - Go to [Google Cloud Console - Credentials](https://console.cloud.google.com/auth/clients)
   - Create a new OAuth 2.0 Client ID (Web application)
   - Set **Authorized JavaScript origins** to: `http://localhost:5173`
   - Set **Authorized redirect URI** to: `https://<your-deployment>.convex.site/api/auth/callback/google`

   (Find your deployment name in `.env.local` under `CONVEX_DEPLOYMENT`)

4. **Set environment variables in Convex dashboard**
   - `AUTH_GOOGLE_ID` — your Google Client ID
   - `AUTH_GOOGLE_SECRET` — your Google Client Secret
   - `SITE_URL` — `http://localhost:5173`

5. **Run the app**
   ```bash
   npm run dev
   ```

## MCP server

To use isitout from AI agents, see [isitout.vercel.app/mcp](https://isitout.vercel.app/mcp).
