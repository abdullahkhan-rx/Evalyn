import asyncio
from sqlalchemy import select
from src.api.db.session import engine
from src.api.models.job import Posts

async def main():
    async with engine.connect() as conn:
        result = await conn.execute(select(Posts).order_by(Posts.created_at.desc()).limit(5))
        jobs = result.fetchall()
        
        print(f"Checking last 5 jobs:")
        for job in jobs:
            print(f"ID: {job.id}, Title: {job.title}, Status: {job.status}, Created By: {job.created_by}, Created At: {job.created_at}")

if __name__ == "__main__":
    asyncio.run(main())
