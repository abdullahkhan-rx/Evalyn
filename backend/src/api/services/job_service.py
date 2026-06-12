from datetime import datetime, timezone, timedelta
from sqlalchemy import func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from src.api.models.job import Posts, JobStatus, JobDeadlineHistory
from src.api.schemas.job import JobCreate, JobUpdate


class JobService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_jobs(self, skip: int = 0, limit: int = 100, status: str = None):
        query = select(Posts)
        
        if status:
            status_enum = status.upper()
            if status_enum == "OPEN":
                # Only Published and not expired
                query = query.where(
                    Posts.status == JobStatus.PUBLISHED,
                    or_(Posts.expires_at == None, Posts.expires_at > datetime.now(timezone.utc))
                )
            elif status_enum == "CLOSED":
                # Explicitly CLOSED or PUBLISHED but expired
                query = query.where(
                    or_(
                        Posts.status == JobStatus.CLOSED,
                        (Posts.status == JobStatus.PUBLISHED) & (Posts.expires_at <= datetime.now(timezone.utc))
                    )
                )
            elif status_enum == "CLOSING_SOON":
                # PUBLISHED, not expired, but expires within 3 days
                three_days_later = datetime.now(timezone.utc) + timedelta(days=3)
                query = query.where(
                    Posts.status == JobStatus.PUBLISHED,
                    Posts.expires_at > datetime.now(timezone.utc),
                    Posts.expires_at <= three_days_later
                )
            else:
                query = query.where(Posts.status == status)
            
        query = query.offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_my_jobs(self, user_id: int, skip: int = 0, limit: int = 100, status: str = None):
        query = select(Posts).where(Posts.created_by == user_id)
        
        if status:
            status_enum = status.upper()
            if status_enum == "OPEN":
                query = query.where(
                    Posts.status == JobStatus.PUBLISHED,
                    or_(Posts.expires_at == None, Posts.expires_at > datetime.now(timezone.utc))
                )
            elif status_enum == "CLOSED":
                query = query.where(
                    or_(
                        Posts.status == JobStatus.CLOSED,
                        (Posts.status == JobStatus.PUBLISHED) & (Posts.expires_at <= datetime.now(timezone.utc))
                    )
                )
            elif status_enum == "CLOSING_SOON":
                three_days_later = datetime.now(timezone.utc) + timedelta(days=3)
                query = query.where(
                    Posts.status == JobStatus.PUBLISHED,
                    Posts.expires_at > datetime.now(timezone.utc),
                    Posts.expires_at <= three_days_later
                )
            else:
                query = query.where(Posts.status == status)
            
        query = query.offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_job(self, job_id: int):
        result = await self.db.execute(select(Posts).where(Posts.id == job_id))
        return result.scalars().first()

    async def create_job(self, job_in: JobCreate, user_id: int):
        payload = job_in.model_dump()
        db_job = Posts(**payload, created_by=user_id)
        self.db.add(db_job)
        await self.db.commit()
        await self.db.refresh(db_job)
        return db_job

    async def update_job(self, job_id: int, job_in: JobUpdate):
        db_job = await self.get_job(job_id)
        if not db_job:
            return None

        update_data = job_in.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_job, key, value)

        await self.db.commit()
        await self.db.refresh(db_job)
        return db_job

    async def improve_job(self, job_id: int, feedback: str):
        from src.flow.prompts.human.jd_prompt import JD_GENERATION_PROMPT
        from src.flow.model.llm_manager import get_llm
        from src.flow.model.structure.jd import JobPost
        from fastapi.concurrency import run_in_threadpool
        
        db_job = await self.get_job(job_id)
        if not db_job:
            return None
        
        # Prepare inputs for the agent based on existing job data
        messages = JD_GENERATION_PROMPT.format_messages(
            job_title=db_job.title,
            location=db_job.location or "Remote",
            skills=", ".join(db_job.required_skills or []),
            company_name=db_job.company_name or "Our Company",
            employment_type=db_job.job_type.value if db_job.job_type else "Full-time",
            experience_level=db_job.experience_level.value if db_job.experience_level else "Mid",
            feedback=feedback
        )
        
        # LLM CALL
        llm = get_llm().with_structured_output(JobPost)
        response = await run_in_threadpool(llm.invoke, messages)
        
        # Convert to dict
        post_data = response.model_dump() if hasattr(response, 'model_dump') else response
        
        # Update the job record
        db_job.title = post_data.get("job_title", db_job.title)
        db_job.description = post_data.get("summary", db_job.description)
        db_job.required_skills = post_data.get("skills", db_job.required_skills)
        db_job.preferred_skills = post_data.get("preferred_qualifications", db_job.preferred_skills)
        db_job.requirements = post_data.get("requirements", db_job.requirements)
        db_job.preferred_qualifications = post_data.get("preferred_qualifications", db_job.preferred_qualifications)
        db_job.benefits = post_data.get("benefits", db_job.benefits)
        
        metadata = db_job.metadata_json or {}
        metadata["responsibilities"] = post_data.get("responsibilities", [])
        metadata["requirements"] = post_data.get("requirements", [])
        metadata["preferred_qualifications"] = post_data.get("preferred_qualifications", [])
        metadata["benefits"] = post_data.get("benefits", [])
        metadata["improved_at_utc"] = datetime.now(timezone.utc).isoformat()
        db_job.metadata_json = metadata
        
        await self.db.commit()
        await self.db.refresh(db_job)
        return db_job

    async def extend_deadline(self, job_id: int, new_deadline: datetime, user_id: int):
        db_job = await self.get_job(job_id)
        if not db_job:
            return None
            
        previous_expiry = db_job.expires_at
        db_job.expires_at = new_deadline
        db_job.application_deadline = new_deadline # Sync for legacy consistency
        db_job.extended_at = datetime.now(timezone.utc)
        db_job.extended_by = user_id
        
        # Auto-reopen if it was CLOSED/EXPIRED
        if db_job.effective_status == JobStatus.CLOSED:
            db_job.status = JobStatus.PUBLISHED
            db_job.reopened_at = datetime.now(timezone.utc)

        # Log history
        history = JobDeadlineHistory(
            job_id=job_id,
            previous_expiry=previous_expiry,
            new_expiry=new_deadline,
            changed_by=user_id
        )
        self.db.add(history)
        
        await self.db.commit()
        await self.db.refresh(db_job)
        return db_job

    async def close_job(self, job_id: int):
        db_job = await self.get_job(job_id)
        if not db_job:
            return None
            
        db_job.status = JobStatus.CLOSED
        db_job.closed_at = datetime.now(timezone.utc)
        
        await self.db.commit()
        await self.db.refresh(db_job)
        return db_job

    async def reopen_job(self, job_id: int, new_deadline: datetime, user_id: int):
        db_job = await self.get_job(job_id)
        if not db_job:
            return None
            
        db_job.status = JobStatus.PUBLISHED
        db_job.expires_at = new_deadline
        db_job.application_deadline = new_deadline
        db_job.reopened_at = datetime.now(timezone.utc)
        db_job.extended_at = datetime.now(timezone.utc)
        db_job.extended_by = user_id
        
        await self.db.commit()
        await self.db.refresh(db_job)
        return db_job

    async def archive_job(self, job_id: int):
        db_job = await self.get_job(job_id)
        if not db_job:
            return None
            
        db_job.status = JobStatus.ARCHIVED
        db_job.archived_at = datetime.now(timezone.utc)
        
        await self.db.commit()
        await self.db.refresh(db_job)
        return db_job

    async def bulk_action(self, job_ids: list[int], action: str, **kwargs):
        results = []
        for jid in job_ids:
            if action == "close":
                results.append(await self.close_job(jid))
            elif action == "archive":
                results.append(await self.archive_job(jid))
            elif action == "extend":
                new_deadline = kwargs.get("new_deadline")
                user_id = kwargs.get("user_id")
                results.append(await self.extend_deadline(jid, new_deadline, user_id))
        return results

    async def generate_draft(self, draft_in: any):
        from src.api.services.jd_generator_service import JDGeneratorService

        job_data = {
            "title": draft_in.title,
            "department": draft_in.department,
            "location": draft_in.location or "Remote",
            "experience_level": draft_in.experience_level or "Mid",
            "job_type": draft_in.job_type or "Full-time",
            "required_skills": draft_in.required_skills or [],
        }
        prompt = getattr(draft_in, "prompt", None)

        generator = JDGeneratorService()
        return await generator.generate_job_description(job_data, prompt=prompt)

    async def delete_job(self, job_id: int):
        db_job = await self.get_job(job_id)
        if db_job:
            await self.db.delete(db_job)
            await self.db.commit()
            return True
        return False

    async def get_total_jobs_count(self):
        result = await self.db.execute(select(func.count()).select_from(Posts))
        return result.scalar()

    async def get_dashboard_stats(self, user_id: int):
        # Total jobs for this user
        total_query = select(func.count()).select_from(Posts).where(Posts.created_by == user_id)
        total_result = await self.db.execute(total_query)
        total_jobs = total_result.scalar()
        
        # Pending actions: DRAFT or CHANGES_REQUESTED
        pending_query = select(func.count()).select_from(Posts).where(
            Posts.created_by == user_id,
            Posts.status.in_([JobStatus.DRAFT, JobStatus.CHANGES_REQUESTED])
        )
        pending_result = await self.db.execute(pending_query)
        pending_actions = pending_result.scalar()
        
        return {
            "total_jobs": total_jobs,
            "pending_actions": pending_actions
        }

    async def publish_job(self, job_id: int, user_id: int):
        from src.api.integrations.indeed import IndeedService
        
        db_job = await self.get_job(job_id)
        if not db_job:
            return None
            
        db_job.status = JobStatus.PUBLISHED
        db_job.published_at = datetime.now(timezone.utc)
        
        await self.db.commit()
        await self.db.refresh(db_job)
        
        # Trigger Indeed Upload
        indeed_service = IndeedService(self.db)
        await indeed_service.upload_job(db_job, user_id)
        
        return db_job

    async def review_job(self, job_id: int, status: str, feedback: str = None):
        db_job = await self.get_job(job_id)
        if not db_job:
            return None
            
        db_job.status = status
        db_job.manager_feedback = feedback
        
        await self.db.commit()
        await self.db.refresh(db_job)
        return db_job