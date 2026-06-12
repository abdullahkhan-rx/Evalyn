import asyncio
from sqlalchemy import select
from src.api.db.session import engine
from src.api.models.user import User

async def main():
    async with engine.connect() as conn:
        result = await conn.execute(select(User))
        users = result.fetchall()
        
        print(f"Users in DB:")
        for user in users:
            print(f"ID: {user.id}, Email: {user.email}, Full Name: {user.full_name}, Is Active: {user.is_active}")

if __name__ == "__main__":
    asyncio.run(main())
