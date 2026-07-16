# RECB Education Portal

Local student-resource portal for Rajkiya Engineering College, Bijnor. Students can browse and download materials; authenticated administrators can upload, edit, and remove materials and announcements.

## Start locally

1. Install Node.js 20 or newer.
2. In PowerShell, open this project folder and run `npm install`.
3. On a new installation, set the first administrator and session secret for the current terminal:

   ```powershell
   $env:SESSION_SECRET = "use-a-long-random-secret-here"
   $env:ADMIN_USERNAME = "portal-admin"
   $env:ADMIN_PASSWORD = "choose-a-password-with-10-or-more-characters"
   npm start
   ```

4. Open `http://localhost:3000`.

The database is stored at `database/recb.db`, and uploaded files are stored at `server/uploads/`. Do not commit either location; they are intentionally ignored by Git.

## Change the admin username or password

### Normal method (recommended)

1. Sign in at `http://localhost:3000/login.html`.
2. Open **Account** in the admin sidebar.
3. Enter the new username, your current password, and the new password twice.
4. Select **Save credentials**. The next login uses the new details.

Usernames may contain letters, numbers, dots, underscores, and hyphens. Passwords must be at least 10 characters.

### If the current password is lost

Stop the server, then run the following in PowerShell from the project folder. Replace the example values before running it:

```powershell
$env:ADMIN_USERNAME = "new-admin-name"
$env:ADMIN_PASSWORD = "new-strong-password"
npm run reset-admin
```

Start the portal again with `npm start` and sign in using those credentials. This creates the username if needed or resets the password for an existing username; it does not remove notes or announcements.

## Available routes

- `GET /api/notes` - materials with optional filters (`year`, `branch`, `type`, `subject`, `q`)
- `GET /api/announcements` - active announcements
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/status`
- `PUT /api/auth/credentials` - authenticated administrator credential update

## Production notes

- Set `NODE_ENV=production` and a stable `SESSION_SECRET` before deployment.
- Serve the site over HTTPS so secure session cookies are enabled.
- Back up `database/recb.db` and `server/uploads/` regularly.
