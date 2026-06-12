import { apiClient } from './client';
import type {
    Job,
    JobStatus,
    JobIntent,
    AIJobDraft,
    PaginatedResponse,
    ApiResponse,
} from '@/lib/types';

/**
 * Job API endpoints
 */

/**
 * Helper to map backend job response to frontend Job type
 */
const mapJob = (job: any): Job => ({
    id: job.id.toString(),
    title: job.title,
    description: job.description,
    short_description: job.short_description,
    department: job.department,
    location: job.location,
    location_type: job.location_type,
    company_name: job.company_name,
    job_type: job.job_type,
    type: job.job_type, // Compatibility field
    experience_level: job.experience_level,
    salary_min: job.salary_min,
    salary_max: job.salary_max,
    salary_currency: job.salary_currency,
    salary_period: job.salary_period,
    salary_range: job.salary_range,
    required_skills: job.required_skills || [],
    preferred_skills: job.preferred_skills || [],
    requirements: job.requirements || [],
    preferred_qualifications: job.preferred_qualifications || [],
    benefits: job.benefits || [],
    application_url: job.application_url,
    status: job.status,
    effective_status: job.effective_status,
    // Backward compatibility fields
    desiredSkills: job.preferred_skills || [],
    candidateCount: job.application_count || 0,
    application_count: job.application_count || 0,
    pendingActionCount: 0,
    createdBy: job.created_by?.toString() || '',
    created_by: job.created_by,
    createdAt: job.created_at,
    created_at: job.created_at,
    publishedAt: job.published_at,
    published_at: job.published_at,
    closedAt: job.expires_at,
    expires_at: job.expires_at,
    manager_feedback: job.manager_feedback,
    closed_at: job.closed_at,
    archived_at: job.archived_at,
    reopened_at: job.reopened_at,
    extended_at: job.extended_at,
    extended_by: job.extended_by,
});

export const jobsApi = {
    /**
     * Get all jobs with optional filtering (requires authentication)
     */
    getAll: async (params?: {
        status?: string;
        department?: string;
        skip?: number;
        limit?: number;
    }): Promise<Job[]> => {
        const jobs = await apiClient.get<any[]>('/jobs', { params });
        return jobs.map(mapJob);
    },

    /**
     * Get published jobs (public, no authentication required)
     */
    getPublic: async (params?: {
        skip?: number;
        limit?: number;
    }): Promise<Job[]> => {
        const jobs = await apiClient.get<any[]>('/jobs/public', { params });
        return jobs.map(mapJob);
    },

    /**
     * Get single job by ID
     */
    getById: async (id: string): Promise<Job> => {
        const job = await apiClient.get<any>(`/jobs/${id}`);
        return mapJob(job);
    },

    /**
     * Create new job from intent
     */
    create: async (intent: JobIntent): Promise<ApiResponse<Job>> => {
        return apiClient.post<ApiResponse<Job>>('/jobs', intent);
    },

    /**
     * Generate an initial AI job draft without creating a record.
     * If `prompt` is provided, it is used as the primary AI instruction.
     */
    generateDraft: async (data: {
        title?: string;
        department?: string;
        location?: string;
        experience_level?: string;
        job_type?: string;
        prompt?: string;
    }): Promise<any> => {
        return apiClient.post<any>('/jobs/generate-draft', data);
    },

    /**
     * Trigger AI generation for job description
     */
    generateDescription: async (jobId: string): Promise<ApiResponse<AIJobDraft>> => {
        return apiClient.post<ApiResponse<AIJobDraft>>(`/jobs/${jobId}/generate`);
    },

    /**
     * Approve AI-generated job description
     */
    approveDraft: async (
        jobId: string,
        editedDescription?: string
    ): Promise<ApiResponse<Job>> => {
        return apiClient.post<ApiResponse<Job>>(`/jobs/${jobId}/approve`, {
            editedDescription,
        });
    },

    /**
     * Publish job to portal
     */
    publish: async (jobId: string): Promise<ApiResponse<Job>> => {
        return apiClient.post<ApiResponse<Job>>(`/jobs/${jobId}/publish`);
    },

    /**
     * Improve job description using AI based on feedback
     */
    improve: async (jobId: string, feedback: string): Promise<Job> => {
        return apiClient.post<Job>(`/jobs/${jobId}/improve`, { feedback });
    },

    /**
     * Update job details
     */
    update: async (jobId: string, updates: Partial<Job>): Promise<ApiResponse<Job>> => {
        return apiClient.put<ApiResponse<Job>>(`/jobs/${jobId}`, updates);
    },

    /**
     * Delete job
     */
    delete: async (jobId: string): Promise<ApiResponse<void>> => {
        return apiClient.delete<ApiResponse<void>>(`/jobs/${jobId}`);
    },

    /**
     * Close job posting
     */
    close: async (jobId: string): Promise<ApiResponse<Job>> => {
        return apiClient.post<ApiResponse<Job>>(`/jobs/${jobId}/close`);
    },

    /**
     * Extend job deadline
     */
    extendDeadline: async (jobId: string, newDeadline: string): Promise<ApiResponse<Job>> => {
        return apiClient.post<ApiResponse<Job>>(`/jobs/${jobId}/extend-deadline`, {
            new_deadline: newDeadline
        });
    },

    /**
     * Reopen a closed job
     */
    reopen: async (jobId: string, newDeadline: string): Promise<ApiResponse<Job>> => {
        return apiClient.post<ApiResponse<Job>>(`/jobs/${jobId}/reopen`, {
            new_deadline: newDeadline
        });
    },

    /**
     * Archive job post
     */
    archive: async (jobId: string): Promise<ApiResponse<Job>> => {
        return apiClient.post<ApiResponse<Job>>(`/jobs/${jobId}/archive`);
    },

    /**
     * Bulk lifecycle action
     */
    bulkLifecycle: async (data: {
        job_ids: string[];
        action: 'close' | 'archive' | 'extend';
        new_deadline?: string;
    }): Promise<{ message: string; processed: number }> => {
        return apiClient.post('/jobs/bulk/lifecycle', data);
    },

    /**
     * Send job details to Operation Manager or specific Team Lead
     */
    sendToManager: async (jobId: string, role?: string): Promise<{ message: string }> => {
        return apiClient.post<{ message: string }>(`/jobs/${jobId}/send-to-manager`, null, {
            params: { role }
        });
    },

    /**
     * Submit Operation Manager review
     */
    review: async (
        jobId: string,
        data: { status: JobStatus; feedback?: string }
    ): Promise<ApiResponse<Job>> => {
        return apiClient.post<ApiResponse<Job>>(`/jobs/${jobId}/review`, data);
    },

    /**
     * Get dashboard statistics
     */
    getStats: async (): Promise<{ total_jobs: number; pending_actions: number }> => {
        return apiClient.get<{ total_jobs: number; pending_actions: number }>('/jobs/stats/dashboard');
    },
};

