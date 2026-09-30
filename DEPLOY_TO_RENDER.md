# Put GameScope online for free

## Recommended host: Render

GameScope is a Node web service because it has accounts, reviews, and API routes.

### 1. Put this folder in a GitHub repository

Create a new GitHub repository named `gamescope`, then upload the contents of this folder.

Do NOT upload passwords, API keys, or other secrets.

### 2. Create the Render service

Open Render and choose:

**New → Web Service**

Connect your GitHub repository.

Use:

- **Name:** `gamescope`
- **Runtime:** Node
- **Build command:** `npm install`
- **Start command:** `npm start`
- **Plan:** Free

Render will build the project and give it a public `https://gamescope-....onrender.com` URL.

### 3. Important account/review storage note

This starter build stores users, sessions, and reviews in JSON files. Render's free web-service filesystem is ephemeral, so those changes can disappear when the service restarts/spins down/redeploys.

For a real public GameScope where accounts and reviews must persist, connect a persistent database before inviting people to create accounts.

A practical free option is Supabase's free Postgres database. It currently includes 500 MB per project, although free projects can pause after inactivity. The app should be migrated to that database rather than relying on local JSON files.

### 4. Live price feeds

The project already supports:

`PRICE_FEED_URL`

Point that environment variable at a normalized JSON feed containing approved store data.

The feed format is documented in `README.md`.

Do not scrape a store in a way that violates its terms. Use approved APIs/feeds or other authorized data sources.

## Updating GameScope

Once Render is connected to GitHub, pushes to the selected branch can automatically trigger redeploys.
