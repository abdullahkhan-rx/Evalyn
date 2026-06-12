import asyncio
from src.api.db.session import engine
from src.api.services.job_service import JobService
from sqlalchemy import select
from src.api.models.user import User

async def main():
    # Test for User 1 and User 81
    for user_id in [1, 81]:
        async with engine.connect() as conn:
            # We need an actual AsyncSession for JobService
            pass
            
    # Simpler: just query directly
    from sqlalchemy import text
    async with engine.connect() as conn:
        for uid in [1, 81]:
            res = await conn.execute(text(f"SELECT COUNT(*) FROM posts WHERE created_by = {uid}"))
            count = res.scalar()
            print(f"User {uid} has {count} jobs")
            
            res = await conn.execute(text(f"SELECT id, title, status FROM posts WHERE created_by = {uid} ORDER BY created_at DESC LIMIT 2"))
            jobs = res.fetchall()
            for j in jobs:
                print(f"  - Job {j.id}: {j.title} (Status: {j.status})")

if __name__ == "__main__":
    asyncio.run(main())
