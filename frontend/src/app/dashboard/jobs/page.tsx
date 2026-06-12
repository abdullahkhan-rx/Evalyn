"use client";

import { useState, useMemo } from 'react';
import { useJobs } from '@/lib/hooks/useJobs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    Briefcase, Users, TrendingUp, Clock, Plus, ArrowRight, Sparkles, Loader2, 
    MoreVertical, Calendar, Archive, XCircle, RefreshCw, AlertCircle, Filter, 
    CheckSquare, Square
} from 'lucide-react';
import Link from 'next/link';
import type { Job } from '@/lib/types';
import { format, isAfter, isBefore, addDays } from 'date-fns';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { jobsApi } from '@/lib/api/jobs';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function JobsPage() {
    const router = useRouter();
    const { data: realJobs, isLoading, refetch } = useJobs();
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
    const [isBulkActionLoading, setIsBulkActionLoading] = useState(false);
    
    // Extend Deadline Dialog State
    const [showExtendDialog, setShowExtendDialog] = useState(false);
    const [extendingJobId, setExtendingJobId] = useState<string | null>(null);
    const [newDeadline, setNewDeadline] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));

    const jobs = useMemo(() => realJobs || [], [realJobs]);

    const filteredJobs = useMemo(() => {
        if (filterStatus === 'ALL') return jobs;
        return jobs.filter(job => {
            const effective = job.effective_status || job.status;
            if (filterStatus === 'OPEN') return effective === 'PUBLISHED';
            if (filterStatus === 'CLOSING_SOON') {
                if (!job.expires_at) return false;
                const expiryDate = new Date(job.expires_at);
                const threeDaysFromNow = addDays(new Date(), 3);
                return effective === 'PUBLISHED' && isBefore(expiryDate, threeDaysFromNow) && isAfter(expiryDate, new Date());
            }
            return effective === filterStatus;
        });
    }, [jobs, filterStatus]);

    const getStatusConfig = (job: Job) => {
        const status = job.effective_status || job.status;
        
        // Special case: Closing Soon
        if (status === 'PUBLISHED' && job.expires_at) {
            const expiryDate = new Date(job.expires_at);
            const threeDaysFromNow = addDays(new Date(), 3);
            if (isBefore(expiryDate, threeDaysFromNow) && isAfter(expiryDate, new Date())) {
                return {
                    label: 'Closing Soon',
                    bg: 'bg-amber-100',
                    text: 'text-amber-700',
                    border: 'border-amber-200',
                    icon: AlertCircle
                };
            }
        }

        const configs: Record<string, any> = {
            DRAFT: {
                label: 'Draft',
                bg: 'bg-slate-100',
                text: 'text-slate-700',
                border: 'border-slate-200',
                icon: Clock
            },
            PUBLISHED: {
                label: 'Open',
                bg: 'bg-green-100',
                text: 'text-green-700',
                border: 'border-green-200',
                icon: RefreshCw
            },
            CLOSED: {
                label: 'Closed',
                bg: 'bg-red-100',
                text: 'text-red-700',
                border: 'border-red-200',
                icon: XCircle
            },
            ARCHIVED: {
                label: 'Archived',
                bg: 'bg-gray-100',
                text: 'text-gray-700',
                border: 'border-gray-200',
                icon: Archive
            },
            APPROVED: {
                label: 'Approved',
                bg: 'bg-blue-100',
                text: 'text-blue-700',
                border: 'border-blue-200',
                icon: Sparkles
            }
        };
        return configs[status] || configs.DRAFT;
    };

    const handleAction = async (action: string, jobId: string) => {
        const loading = toast.loading(`${action.charAt(0).toUpperCase() + action.slice(1)}ing job...`);
        try {
            if (action === 'close') await jobsApi.close(jobId);
            if (action === 'archive') await jobsApi.archive(jobId);
            if (action === 'reopen') {
                setExtendingJobId(jobId);
                setShowExtendDialog(true);
                toast.dismiss(loading);
                return;
            }
            if (action === 'extend') {
                setExtendingJobId(jobId);
                setShowExtendDialog(true);
                toast.dismiss(loading);
                return;
            }
            toast.success(`Job ${action}d successfully`);
            refetch();
        } catch (error: any) {
            toast.error(`Failed to ${action} job: ${error.message}`);
        } finally {
            toast.dismiss(loading);
        }
    };

    const handleBulkAction = async (action: 'close' | 'archive' | 'extend') => {
        if (selectedJobs.length === 0) return;
        
        if (action === 'extend') {
            setShowExtendDialog(true);
            return;
        }

        setIsBulkActionLoading(true);
        const loading = toast.loading(`Performing bulk ${action}...`);
        try {
            await jobsApi.bulkLifecycle({
                job_ids: selectedJobs,
                action: action
            });
            toast.success(`Bulk ${action} completed`);
            setSelectedJobs([]);
            refetch();
        } catch (error: any) {
            toast.error(`Bulk ${action} failed: ${error.message}`);
        } finally {
            toast.dismiss(loading);
            setIsBulkActionLoading(false);
        }
    };

    const handleExtendDeadline = async () => {
        if (!extendingJobId && selectedJobs.length === 0) return;
        
        const loading = toast.loading("Updating deadline...");
        try {
            if (extendingJobId) {
                // Determine if we are reopening or extending
                const job = jobs.find(j => j.id === extendingJobId);
                if (job?.effective_status === 'CLOSED') {
                    await jobsApi.reopen(extendingJobId, new Date(newDeadline).toISOString());
                } else {
                    await jobsApi.extendDeadline(extendingJobId, new Date(newDeadline).toISOString());
                }
            } else {
                await jobsApi.bulkLifecycle({
                    job_ids: selectedJobs,
                    action: 'extend',
                    new_deadline: new Date(newDeadline).toISOString()
                });
                setSelectedJobs([]);
            }
            
            toast.success("Deadline updated successfully");
            setShowExtendDialog(false);
            setExtendingJobId(null);
            refetch();
        } catch (error: any) {
            toast.error(`Failed to update deadline: ${error.message}`);
        } finally {
            toast.dismiss(loading);
        }
    };

    const toggleJobSelection = (jobId: string) => {
        setSelectedJobs(prev => 
            prev.includes(jobId) 
                ? prev.filter(id => id !== jobId) 
                : [...prev, jobId]
        );
    };

    const stats = [
        {
            title: 'Total Jobs',
            value: jobs.length,
            icon: Briefcase,
            gradient: 'from-indigo-500 to-purple-600',
            iconBg: 'bg-indigo-100',
            iconColor: 'text-indigo-600'
        },
        {
            title: 'Total Candidates',
            value: jobs.reduce((sum: number, job: Job) => sum + (job.application_count || 0), 0),
            icon: Users,
            gradient: 'from-emerald-500 to-teal-600',
            iconBg: 'bg-emerald-100',
            iconColor: 'text-emerald-600'
        },
        {
            title: 'Open Positions',
            value: jobs.filter((j: Job) => (j.effective_status || j.status) === 'PUBLISHED').length,
            icon: TrendingUp,
            gradient: 'from-blue-500 to-cyan-600',
            iconBg: 'bg-blue-100',
            iconColor: 'text-blue-600'
        },
        {
            title: 'Needs Review',
            value: jobs.filter((j: Job) => ['DRAFT', 'CHANGES_REQUESTED'].includes(j.status)).length,
            icon: Clock,
            gradient: 'from-amber-500 to-orange-600',
            iconBg: 'bg-amber-100',
            iconColor: 'text-amber-600',
            highlight: jobs.some((j: Job) => ['DRAFT', 'CHANGES_REQUESTED'].includes(j.status))
        },
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 bg-clip-text text-transparent">
                        Job Postings
                    </h1>
                    <p className="text-slate-500 mt-1">Manage your hiring pipeline with ease</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/dashboard/jobs/new">
                        <Button size="lg" className="btn-premium text-white border-0 gap-2 group">
                            <Plus className="h-5 w-5 transition-transform group-hover:rotate-90 duration-300" />
                            Create New Job
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {stats.map((stat, index) => (
                    <Card key={stat.title} className="stat-card border-0 shadow-lg overflow-hidden animate-fade-in-up">
                        <CardContent className="p-5">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-slate-500">{stat.title}</p>
                                    <p className={`text-3xl font-bold ${stat.highlight ? 'text-amber-600' : 'text-slate-900'}`}>{stat.value}</p>
                                </div>
                                <div className={`p-3 rounded-xl ${stat.iconBg} icon-container`}>
                                    <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Filters and Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
                    <Button 
                        variant={filterStatus === 'ALL' ? 'default' : 'outline'} 
                        size="sm" 
                        onClick={() => setFilterStatus('ALL')}
                        className="rounded-full px-4"
                    >
                        All Jobs
                    </Button>
                    <Button 
                        variant={filterStatus === 'OPEN' ? 'default' : 'outline'} 
                        size="sm" 
                        onClick={() => setFilterStatus('OPEN')}
                        className="rounded-full px-4"
                    >
                        Open
                    </Button>
                    <Button 
                        variant={filterStatus === 'CLOSING_SOON' ? 'default' : 'outline'} 
                        size="sm" 
                        onClick={() => setFilterStatus('CLOSING_SOON')}
                        className="rounded-full px-4 flex gap-1.5"
                    >
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                        Closing Soon
                    </Button>
                    <Button 
                        variant={filterStatus === 'CLOSED' ? 'default' : 'outline'} 
                        size="sm" 
                        onClick={() => setFilterStatus('CLOSED')}
                        className="rounded-full px-4"
                    >
                        Closed
                    </Button>
                    <Button 
                        variant={filterStatus === 'ARCHIVED' ? 'default' : 'outline'} 
                        size="sm" 
                        onClick={() => setFilterStatus('ARCHIVED')}
                        className="rounded-full px-4"
                    >
                        Archived
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    {selectedJobs.length > 0 && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                            <span className="text-sm font-medium text-indigo-600 px-3">
                                {selectedJobs.length} selected
                            </span>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50">
                                        Bulk Actions <ChevronDown className="ml-2 h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleBulkAction('close')}>
                                        <XCircle className="mr-2 h-4 w-4" /> Close Selected
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleBulkAction('extend')}>
                                        <Calendar className="mr-2 h-4 w-4" /> Extend Deadline
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleBulkAction('archive')} className="text-red-600">
                                        <Archive className="mr-2 h-4 w-4" /> Archive Selected
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredJobs.map((job: Job, index: number) => {
                    const statusConfig = getStatusConfig(job);
                    const isSelected = selectedJobs.includes(job.id);
                    const effectiveStatus = job.effective_status || job.status;

                    return (
                        <Card
                            key={job.id}
                            className={`glass border transition-all duration-300 card-glow animate-fade-in-up group relative ${
                                isSelected ? 'border-indigo-400 ring-1 ring-indigo-400 bg-indigo-50/30' : 'border-white/40 shadow-lg'
                            }`}
                        >
                            <div className="absolute top-4 left-4 z-10">
                                <button 
                                    onClick={() => toggleJobSelection(job.id)}
                                    className={`p-1 rounded-md transition-colors ${
                                        isSelected ? 'text-indigo-600 bg-white shadow-sm' : 'text-slate-300 hover:text-slate-400 bg-slate-50/50'
                                    }`}
                                >
                                    {isSelected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                                </button>
                            </div>

                            <CardHeader className="pb-3 pl-12">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <CardTitle className="text-lg font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors truncate">
                                            {job.title}
                                        </CardTitle>
                                        <CardDescription className="mt-1 flex items-center gap-2">
                                            <span>{job.department}</span>
                                            {job.location && <span className="flex items-center gap-1">• {job.location}</span>}
                                        </CardDescription>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {effectiveStatus === 'PUBLISHED' && (
                                                <>
                                                    <DropdownMenuItem onClick={() => handleAction('extend', job.id)}>
                                                        <Calendar className="mr-2 h-4 w-4" /> Extend Deadline
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleAction('close', job.id)}>
                                                        <XCircle className="mr-2 h-4 w-4" /> Close Posting
                                                    </DropdownMenuItem>
                                                </>
                                            )}
                                            {effectiveStatus === 'CLOSED' && (
                                                <DropdownMenuItem onClick={() => handleAction('reopen', job.id)}>
                                                    <RefreshCw className="mr-2 h-4 w-4" /> Reopen Job
                                                </DropdownMenuItem>
                                            )}
                                            {effectiveStatus !== 'ARCHIVED' && (
                                                <DropdownMenuItem onClick={() => handleAction('archive', job.id)} className="text-red-600">
                                                    <Archive className="mr-2 h-4 w-4" /> Archive
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => router.push(`/dashboard/jobs/${job.id}`)}>
                                                View Details
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                    <Badge className={`${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border} flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium`}>
                                        <statusConfig.icon className="h-3 w-3" />
                                        {statusConfig.label}
                                    </Badge>
                                    {job.expires_at && effectiveStatus === 'PUBLISHED' && (
                                        <span className="text-[10px] text-slate-500 font-medium">
                                            Expires {format(new Date(job.expires_at), 'MMM d')}
                                        </span>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500 flex items-center gap-2">
                                        <Users className="h-4 w-4" />
                                        Candidates
                                    </span>
                                    <span className="font-semibold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-full text-xs">
                                        {job.candidateCount || 0}
                                    </span>
                                </div>

                                <Link href={`/dashboard/pipeline?jobId=${job.id}`}>
                                    <Button
                                        variant="outline"
                                        className="w-full mt-2 group/btn hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-all border-slate-200"
                                    >
                                        Pipeline View
                                        <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover/btn:translate-x-1" />
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Extend Deadline Dialog */}
            <Dialog open={showExtendDialog} onOpenChange={setShowExtendDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Set New Application Deadline</DialogTitle>
                        <DialogDescription>
                            {extendingJobId 
                                ? "Choose a new expiration date for this position." 
                                : `Extending ${selectedJobs.length} positions. Choose a new expiration date.`
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Expiration Date</label>
                            <Input 
                                type="date" 
                                value={newDeadline} 
                                onChange={(e) => setNewDeadline(e.target.value)}
                                min={format(new Date(), 'yyyy-MM-dd')}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowExtendDialog(false)}>Cancel</Button>
                        <Button onClick={handleExtendDeadline}>Update Deadline</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function ChevronDown({className}: {className?: string}) {
    return <svg className={className} width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.13523 6.15803C3.3241 5.95657 3.64057 5.94637 3.84203 6.13523L7.5 9.56464L11.158 6.13523C11.3594 5.94637 11.6759 5.95657 11.8648 6.15803C12.0536 6.35949 12.0434 6.67597 11.842 6.86484L7.84199 10.6148C7.64491 10.7996 7.35509 10.7996 7.15801 10.6148L3.15801 6.86484C2.95655 6.67597 2.94635 6.35949 3.13523 6.15803Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>;
}

