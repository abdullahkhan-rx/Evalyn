import asyncio
from src.api.db.session import engine
from src.api.services.job_service import JobService
from src.api.schemas.job import JobResponse
from src.api.models.job import JobStatus
import json

async def main():
    job_service = JobService(None) # Not really needed if we just mock data
    
    # Let's see how JobResponse serializes JobStatus.DRAFT
    from datetime import datetime, timezone
    mock_job = {
        "id": 1,
        "title": "Test",
        "description": "Test",
        "status": JobStatus.DRAFT,
        "created_by": 1,
        "created_at": datetime.now(timezone.utc),
        "required_skills": ["Python"]
    }
    
    # This is what FastAPI does
    response = JobResponse.model_validate(mock_job)
    print(f"Serialized status: {response.status}")
    print(f"JSON Output: {response.model_dump_json()}")

if __name__ == "__main__":
    asyncio.run(main())
