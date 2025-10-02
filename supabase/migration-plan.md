# Supabase Migration Plan

This guide covers the data migration workflow from the existing MongoDB database to the new Supabase (PostgreSQL) schema.

## 1. Prerequisites

- Supabase project configured with the schema in `supabase/migrations/0001_initial_schema.sql`.
- Supabase service-role key stored in `.env` as `SUPABASE_SERVICE_ROLE_KEY`.
- MongoDB connection string accessible locally (e.g., `MONGO_URL`).
- Node.js 18+ (for running migration utilities).
- Installed dependencies: run `npm install` after updating `package.json`.

## 2. Export MongoDB Collections

Run `mongoexport` for each collection you need to migrate. Save outputs in a local `exports/` folder (ignored from version control).

```bash
mkdir -p exports
mongoexport --uri "$MONGO_URL" --collection users --out exports/users.json
mongoexport --uri "$MONGO_URL" --collection documents --out exports/documents.json
mongoexport --uri "$MONGO_URL" --collection botconfigs --out exports/botconfigs.json
mongoexport --uri "$MONGO_URL" --collection pets --out exports/pets.json
mongoexport --uri "$MONGO_URL" --collection battles --out exports/battles.json
mongoexport --uri "$MONGO_URL" --collection tickets --out exports/tickets.json
```

> Replace collection names if they differ in your Mongo deployment.

## 3. Transform & Load (Node Scripts)

A reusable migration utility is being added under `scripts/` for each major collection. These scripts:

1. Read exported JSON.
2. Map Mongo document fields to the Supabase schema.
3. Insert data via Supabase admin API.
4. Populate child tables (e.g., `user_nft_tokens`, `user_verification_history`).

Example usage (users collection):

```bash
node scripts/migrate-users-to-supabase.js --file=exports/users.json --batch=100
```

Each script accepts:
- `--file` (required): path to exported JSON.
- `--batch` (optional): number of records per insert batch (defaults to 50).
- `--dry-run` (optional flag): validate transformations without writing to Supabase.

The migration scripts rely on environment variables loaded via `.env`. Ensure the following are set:

```env
SUPABASE_URL=<https://your-project.supabase.co>
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 4. Migration Order & Referencing

Run migrations in the following sequence to maintain foreign key integrity:

1. `users`
2. `documents`
3. `bot_configs`
4. Feature tables (`pets`, `battles`, `tickets`)
5. Derived/child tables (e.g., ticket messages, battle logs)

Re-run scripts if needed; they use UPSERT semantics on primary tables to avoid duplicates.

## 5. Verification Checklist

After loading data:

- **Row counts**: Compare Mongo collection counts with Supabase tables.
- **Spot check**: Query Supabase via SQL Editor to confirm example records.
- **Constraints**: Ensure unique indices (e.g., `(discord_id, guild_id)`) do not fail during inserts.
- **Foreign keys**: Confirm child tables reference valid parent IDs.

## 6. Rollback Strategy

Because Supabase inserts are idempotent per script run, rollback typically involves truncating tables and re-running migration.

```sql
TRUNCATE TABLE user_nft_tokens, user_verification_history, user_roles, users RESTART IDENTITY CASCADE;

Run the `TRUNCATE` command only if you need to redo the import from scratch.

## 7. Next Steps

- Implement additional migration scripts (`documents`, `bot_configs`, etc.) following the `scripts/migrate-users-to-supabase.js` template.
- Add automated data validation checks (e.g., compare verification counts per guild) once initial migrations succeed.
- Update operational documentation after a successful dry run.

## Phase 5: Tokenized Verification Flow

- [x] Implement session tokens for verification via `verification_sessions`
- [x] Update API routes and commands to use sessions (`/api/verification/session` endpoints)
- [x] Update Discord `/verify` and `/verify-nft` commands to launch the portal
- [x] Ensure role assignment works post-session verification (via `assignRolesBasedOnNfts` in API)
- [x] Provide shared UI helpers for portal messaging (`src/utils/verificationSessionUi.js`)

## Phase 6: Testing, Documentation & Rollout (in progress)

- [ ] Validate Supabase verification flow end-to-end (API + Discord interaction)
- [ ] Validate MongoDB fallback remains functional when `USE_SUPABASE` is false
- [ ] Update documentation (README, Verification Setup Guide) for portal-based flow
- [ ] Provide rollout instructions and checklist for switching to Supabase

## Appendix A: Guild Contract Verification Rules

### Managing Contract Thresholds

Use the `/verification-config` slash command (requires the **Manage Server** permission) to configure the new `guild_verification_contracts` table without touching SQL directly.

- `/verification-config list`
  Lists all configured rules for the current guild, showing contract address, required NFT count, and target role.

- `/verification-config add contract_address:<address> required_nfts:<n>`
  Creates or updates a rule. Include `role:@Role` to map directly by role mention, or supply `role_name:"Role Name"` if the ID is unknown. Defaults to a threshold of `1` when `required_nfts` is omitted.

- `/verification-config remove contract_address:<address>`
  Deletes the rule for the given contract.

### Portal & Discord Testing Checklist

1. **Apply migrations**
   - Run `supabase db push` (or your preferred workflow) to apply `0002_guild_verification_contracts.sql`.

2. **Seed contract rules**
   - In Discord, run `/verification-config add` with a known contract + threshold + role.

3. **Run verification flow**
   - Execute `/verify-nft`, complete the portal signature, and confirm:
     - The portal success state lists each configured contract with owned vs required counts.
     - The follow-up interaction message (ephemeral in-channel) reflects the verification result.
     - Roles update according to the configured threshold(s).

4. **Regression checks**
   - Remove the rule with `/verification-config remove` and verify legacy role-tier logic still applies (if configured).
   - Toggle `USE_SUPABASE=false` to confirm MongoDB fallback is unchanged.
