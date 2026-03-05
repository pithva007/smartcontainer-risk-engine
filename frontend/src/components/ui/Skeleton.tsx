export function Skeleton({ className = '', count = 1 }: { className?: string; count?: number }) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className={`skeleton ${className}`} />
            ))}
        </>
    );
}

export function CardSkeleton() {
    return (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="flex justify-between">
                <div className="skeleton h-4 w-24" />
                <div className="skeleton h-8 w-8 rounded-lg" />
            </div>
            <div className="skeleton h-8 w-20" />
            <div className="skeleton h-3 w-32" />
        </div>
    );
}

export function ChartSkeleton() {
    return (
        <div className="bg-card border border-border rounded-xl p-5">
            <div className="skeleton h-5 w-40 mb-4" />
            <div className="skeleton h-64 w-full rounded-lg" />
        </div>
    );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
                <div className="skeleton h-5 w-48" />
            </div>
            <div className="divide-y divide-border">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="flex gap-4 p-4">
                        <div className="skeleton h-4 w-28" />
                        <div className="skeleton h-4 w-16" />
                        <div className="skeleton h-4 w-20" />
                        <div className="skeleton h-4 w-24" />
                    </div>
                ))}
            </div>
        </div>
    );
}
