import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { RiskLevel } from '@/types/apiTypes';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const riskColor: Record<RiskLevel, string> = {
    Critical: '#ef4444',
    'Low Risk': '#eab308',
    Clear: '#10b981',
};

export const riskBgClass: Record<RiskLevel, string> = {
    Critical: 'bg-risk-critical/15 text-risk-critical',
    'Low Risk': 'bg-risk-low/15 text-risk-low',
    Clear: 'bg-risk-clear/15 text-risk-clear',
};

export const riskRowClass: Record<RiskLevel, string> = {
    Critical: 'bg-risk-critical/8 hover:bg-risk-critical/15',
    'Low Risk': 'bg-risk-low/8 hover:bg-risk-low/15',
    Clear: 'bg-risk-clear/8 hover:bg-risk-clear/15',
};
