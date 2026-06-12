import asyncio
from sqlalchemy import text
from src.api.db.session import engine

async def main():
    commands = [
        # Add columns to posts table
        "ALTER TABLE posts ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE posts ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE posts ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE posts ADD COLUMN IF NOT EXISTS extended_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE posts ADD COLUMN IF NOT EXISTS extended_by INTEGER REFERENCES users(id) ON DELETE SET NULL",
        
        # Create job_deadline_history table
        """
        CREATE TABLE IF NOT EXISTS job_deadline_history (
            id SERIAL PRIMARY KEY,
            job_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
            previous_expiry TIMESTAMP WITH TIME ZONE,
            new_expiry TIMESTAMP WITH TIME ZONE NOT NULL,
            changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """,
        # Add index for job_id in history table
        "CREATE INDEX IF NOT EXISTS idx_job_deadline_history_job_id ON job_deadline_history(job_id)"
    ]
    
    print("Starting lifecycle schema migration...")
    async with engine.begin() as conn:
        for cmd in commands:
            try:
                await conn.execute(text(cmd))
                print(f"Executed: {cmd.strip().splitlines()[0][:60]}...")
            except Exception as e:
                print(f"Error executing command: {cmd[:50]}...")
                print(f"Error details: {e}")
                
    print("Migration completed!")

if __name__ == "__main__":
    asyncio.run(main())
