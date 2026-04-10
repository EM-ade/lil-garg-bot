# 🐘 How to Run psql - Complete Guide for Windows

This guide shows you multiple ways to run `psql` commands on Windows to set up your PostgreSQL database.

---

## ❓ What is psql?

`psql` is the PostgreSQL command-line interface. You use it to:
- Run SQL commands
- Execute migration files
- Query your database
- Manage tables and users

---

## ✅ Method 1: Using Supabase SQL Editor (Easiest - No Installation!)

**Recommended for beginners or if you're using Supabase.**

### Step 1: Open Supabase Dashboard

1. Go to [supabase.com](https://supabase.com)
2. Sign in to your account
3. Select your project

### Step 2: Open SQL Editor

1. Click **"SQL Editor"** in the left sidebar
2. Click **"New Query"**

### Step 3: Run Migration

1. Open the file: `sql/001_multi_tenant_schema.sql`
2. Copy all contents
3. Paste into Supabase SQL Editor
4. Click **"Run"** or press `Ctrl+Enter`

### Step 4: Verify Tables Created

Run this query:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```

You should see 8 tables:
- `guilds`
- `collections`
- `role_mappings`
- `wallets`
- `verifications`
- `verification_sessions`
- `audit_logs`
- `rate_limits`

**✅ Done!** No installation needed.

---

## ✅ Method 2: Install PostgreSQL for Windows (Full Installation)

**Recommended for local development.**

### Step 1: Download PostgreSQL

1. Go to [PostgreSQL Download](https://www.postgresql.org/download/windows/)
2. Click **"Download the installer"**
3. Choose version 15 or 16 (latest stable)

### Step 2: Run Installer

1. Run the downloaded `.exe` file
2. Click **Next** through the wizard
3. **Important:** Remember your postgres password!
4. Keep default port: `5432`
5. Install pgAdmin (included) - useful GUI tool

### Step 3: Add psql to PATH (Optional but Recommended)

By default, psql is installed to:
```
C:\Program Files\PostgreSQL\15\bin\psql.exe
```

To add to PATH:

**Windows 10/11:**
1. Press `Win + X` → System
2. Click **"Advanced system settings"**
3. Click **"Environment Variables"**
4. Under "System variables", find `Path`
5. Click **Edit** → **New**
6. Add: `C:\Program Files\PostgreSQL\15\bin`
7. Click **OK** on all windows

**Verify installation:**
```cmd
psql --version
```

Should show: `psql (PostgreSQL) 15.x.x`

### Step 4: Create Database

Open **Command Prompt** or **PowerShell**:

```cmd
# Connect as postgres user
psql -U postgres

# In psql prompt, create database:
CREATE DATABASE lil_garg_bot;

# List databases:
\l

# Exit psql:
\q
```

### Step 5: Run Migration

```cmd
# Method 1: One-liner
psql -U postgres -d lil_garg_bot -f "C:\Users\Ajibola Adedeji\Documents\GitHub\Discord Bot\lil-garg-bot\sql\001_multi_tenant_schema.sql"

# Method 2: Interactive
psql -U postgres -d lil_garg_bot

# Then in psql prompt:
\i "C:\Users\Ajibola Adedeji\Documents\GitHub\Discord Bot\lil-garg-bot\sql\001_multi_tenant_schema.sql"
```

**If prompted for password:**
- Enter the password you set during PostgreSQL installation

---

## ✅ Method 3: Using psql from PostgreSQL Installation (No PATH)

If you installed PostgreSQL but didn't add to PATH:

### Step 1: Open Command Prompt in Bot Directory

```cmd
cd "C:\Users\Ajibola Adedeji\Documents\GitHub\Discord Bot\lil-garg-bot"
```

### Step 2: Run psql with Full Path

```cmd
"C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -d lil_garg_bot -f sql\001_multi_tenant_schema.sql
```

---

## ✅ Method 4: Using PowerShell (Alternative to Command Prompt)

### Step 1: Open PowerShell as Administrator

Press `Win + X` → **Windows PowerShell (Admin)**

### Step 2: Set Environment Variable

```powershell
$env:PGPASSWORD="your_postgres_password"
```

### Step 3: Run Migration

```powershell
& "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -d lil_garg_bot -f "sql\001_multi_tenant_schema.sql"
```

---

## ✅ Method 5: Using Docker (Advanced)

**If you have Docker installed:**

### Step 1: Run PostgreSQL Container

```cmd
docker run --name postgres-bot -e POSTGRES_PASSWORD=mysecretpassword -p 5432:5432 -d postgres:15
```

### Step 2: Run Migration

```cmd
docker exec -i postgres-bot psql -U postgres -d postgres < sql\001_multi_tenant_schema.sql
```

### Step 3: Connect to Database

```cmd
docker exec -it postgres-bot psql -U postgres -d postgres
```

---

## 🔧 Common psql Commands

Once inside psql:

```sql
-- List all databases
\l

-- Connect to a database
\c database_name

-- List all tables
\dt

-- Describe a table (show columns)
\d table_name

-- Run SQL query
SELECT * FROM guilds;

-- Run SQL file
\i path/to/file.sql

-- Exit psql
\q

-- Show help
\?
```

---

## 🐛 Troubleshooting

### Error: 'psql' is not recognized

**Solution 1:** Use full path
```cmd
"C:\Program Files\PostgreSQL\15\bin\psql.exe" --version
```

**Solution 2:** Add to PATH (see Method 2, Step 3)

**Solution 3:** Restart terminal after adding to PATH

### Error: connection refused

**Cause:** PostgreSQL service not running

**Fix:**
1. Press `Win + R`
2. Type: `services.msc`
3. Find: `postgresql-x64-15`
4. Right-click → **Start**

### Error: password authentication failed

**Fix:**
1. Open pgAdmin (installed with PostgreSQL)
2. Right-click on server → Properties
3. Change password
4. Or reset via command:
   ```cmd
   psql -U postgres
   ALTER USER postgres WITH PASSWORD 'newpassword';
   ```

### Error: database does not exist

**Fix:**
```cmd
psql -U postgres
CREATE DATABASE lil_garg_bot;
\q
```

### Error: file not found

**Make sure you're in the correct directory:**
```cmd
cd "C:\Users\Ajibola Adedeji\Documents\GitHub\Discord Bot\lil-garg-bot"
dir sql
```

You should see `001_multi_tenant_schema.sql`

---

## 🎯 Quick Reference

### For Supabase Users (Recommended)

```bash
# No psql needed! Use web interface:
# 1. Go to supabase.com
# 2. Open SQL Editor
# 3. Paste contents of sql/001_multi_tenant_schema.sql
# 4. Click Run
```

### For Local PostgreSQL Users

```cmd
# 1. Create database
psql -U postgres
CREATE DATABASE lil_garg_bot;
\q

# 2. Run migration
psql -U postgres -d lil_garg_bot -f sql\001_multi_tenant_schema.sql

# 3. Verify
psql -U postgres -d lil_garg_bot -c "\dt"
```

### For Supabase with Local psql

```cmd
# Get connection string from Supabase dashboard
# Settings → Database → Connection string

# Set password (PowerShell)
$env:PGPASSWORD="your_supabase_password"

# Run migration
psql "postgresql://postgres.[project]:[password]@db.[project].supabase.co:5432/postgres" -f sql\001_multi_tenant_schema.sql
```

---

## 📱 GUI Alternatives to psql

If you prefer graphical tools:

### 1. pgAdmin (Included with PostgreSQL)

1. Open pgAdmin 4
2. Add server (use your credentials)
3. Right-click database → Query Tool
4. Paste SQL and run

### 2. DBeaver (Free, Cross-Platform)

1. Download: [dbeaver.io](https://dbeaver.io/)
2. Install and open
3. New Connection → PostgreSQL
4. Enter credentials
5. Right-click database → SQL Editor
6. Paste and run SQL

### 3. Supabase Dashboard (Web-based)

1. Go to supabase.com
2. Select project
3. SQL Editor → New Query
4. Paste and run

---

## ✅ Verification Checklist

After running migration, verify:

```sql
-- Check tables exist
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
-- Should return: 8

-- Check extensions
SELECT * FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgcrypto');
-- Should return: 2 rows

-- Test insert (optional)
INSERT INTO guilds (guild_id, guild_name) VALUES ('123', 'Test Guild');
SELECT * FROM guilds WHERE guild_id = '123';
DELETE FROM guilds WHERE guild_id = '123';
```

---

## 🆘 Still Having Issues?

### Alternative: Use Node.js Script

Create `scripts/setup-db.js`:

```javascript
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function setup() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  await client.connect();
  
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'sql', '001_multi_tenant_schema.sql'),
    'utf8'
  );
  
  await client.query(sql);
  await client.end();
  
  console.log('✅ Database setup complete!');
}

setup().catch(console.error);
```

Run with:
```cmd
node scripts/setup-db.js
```

---

**Last Updated:** 2026-01-01  
**Tested On:** Windows 10/11, PostgreSQL 15/16
