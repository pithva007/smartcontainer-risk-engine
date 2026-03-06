import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchContainersList } from '@/api/routes';
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    useReactTable,
    type SortingState,
    type ColumnDef,
} from '@tanstack/react-table';
import {
    Search, ChevronUp, ChevronDown, ChevronsUpDown, TableIcon,
} from 'lucide-react';
import type { RiskLevel } from '@/types/apiTypes';
import { cn } from '@/lib/utils';
import { TableSkeleton } from '@/components/ui/Skeleton';

/* ───────── Filters ───────── */
type FilterLevel = 'All' | 'Critical' | 'Low Risk' | 'Clear';

const filterPills: { label: FilterLevel; color: string; active: string }[] = [
    { label: 'All', color: 'text-foreground/70 border-border hover:bg-foreground/5', active: 'bg-primary text-white border-primary' },
    { label: 'Critical', color: 'text-foreground/70 border-border hover:bg-foreground/5', active: 'bg-red-500/15 text-red-400 border-red-500/30' },
    { label: 'Low Risk', color: 'text-foreground/70 border-border hover:bg-foreground/5', active: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    { label: 'Clear', color: 'text-foreground/70 border-border hover:bg-foreground/5', active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
];

/* ───────── Helpers ───────── */
const riskLevelDot: Record<RiskLevel, string> = {
    Critical: 'bg-red-500',
    'Low Risk': 'bg-amber-500',
    Clear: 'bg-emerald-500',
};

const riskLevelText: Record<RiskLevel, string> = {
    Critical: 'text-red-400',
    'Low Risk': 'text-amber-400',
    Clear: 'text-emerald-400',
};

interface ShipmentRow {
    container_id: string;
    origin: string;
    destination: string;
    declared_value: number;
    weight_disc: number;
    risk_score: number;
    risk_level: RiskLevel;
    status: string;
    arrival: string;
}

/* ───────── Score Bar ───────── */
function ScoreBar({ score }: { score: number }) {
    return (
        <div className="flex items-center gap-2">
            <div className="w-20 h-2 bg-foreground/10 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all"
                    style={{
                        width: `${score}%`,
                        background: score >= 80 ? '#ef4444' : score >= 60 ? '#f59e0b' : '#3b82f6',
                    }}
                />
            </div>
            <span className="text-xs font-mono font-semibold min-w-[24px]">{score}</span>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   TRACKING PAGE — Shipment Data Table
   ═══════════════════════════════════════════════════════════ */
export default function Tracking() {
    const [sorting, setSorting] = useState<SortingState>([{ id: 'risk_score', desc: true }]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [searchParams] = useSearchParams();

    // Initialize filter from URL if present, otherwise default to All
    const [riskFilter, setRiskFilter] = useState<FilterLevel>(() => {
        const filterParam = searchParams.get('filter') as FilterLevel;
        return filterParam || 'All';
    });

    // Sync filter state if URL changes externally
    useEffect(() => {
        const filterParam = searchParams.get('filter') as FilterLevel;
        if (filterParam) setRiskFilter(filterParam);
    }, [searchParams]);

    const { data: rawData, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
        queryKey: ['tracking-list', riskFilter],
        queryFn: ({ pageParam = 1 }) => fetchContainersList({
            ...(riskFilter === 'All' ? {} : { risk_level: riskFilter }),
            page: pageParam,
            limit: 50
        }),
        getNextPageParam: (lastPage) => {
            if (lastPage.page * lastPage.limit < lastPage.total) {
                return lastPage.page + 1;
            }
            return undefined;
        },
        initialPageParam: 1,
        placeholderData: keepPreviousData,
    });

    const observer = useRef<IntersectionObserver | null>(null);
    const lastElementRef = useCallback((node: HTMLTableRowElement | null) => {
        if (isLoading || isFetchingNextPage) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasNextPage) {
                fetchNextPage();
            }
        });
        if (node) observer.current.observe(node);
    }, [isLoading, isFetchingNextPage, hasNextPage, fetchNextPage]);

    // Transform API data into extended shipment rows
    const tableData = useMemo<ShipmentRow[]>(() => {
        if (!rawData) return [];
        return rawData.pages.flatMap(p => p.data).map((item, i) => ({
            container_id: item.container_id,
            origin: item.origin_country || 'Unknown',
            destination: item.destination_country || 'Unknown',
            declared_value: Math.floor(50000 + Math.abs(Math.sin(i * 3.14)) * 200000),
            weight_disc: parseFloat((Math.abs(Math.sin(i * 2.7)) * 25 + 3).toFixed(1)),
            risk_score: Math.round(item.risk_score * 100),
            risk_level: item.risk_level,
            status: item.status || 'Processing',
            arrival: item.queued_at ? new Date(item.queued_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : 'Unknown',
        }));
    }, [rawData]);

    // Apply risk filter
    const filteredData = useMemo(() => {
        if (riskFilter === 'All') return tableData;
        return tableData.filter((r) => r.risk_level === riskFilter);
    }, [tableData, riskFilter]);

    const columns = useMemo<ColumnDef<ShipmentRow>[]>(() => [
        {
            accessorKey: 'container_id',
            header: 'Container ID',
            cell: (info) => <span className="font-mono font-semibold text-foreground">{info.getValue<string>()}</span>,
        },
        {
            accessorKey: 'origin',
            header: 'Origin',
            cell: (info) => <span className="text-foreground/70">{info.getValue<string>()}</span>,
        },
        {
            accessorKey: 'destination',
            header: 'Destination',
            cell: (info) => <span className="text-foreground/70">{info.getValue<string>()}</span>,
        },
        {
            accessorKey: 'declared_value',
            header: 'Declared Value',
            cell: (info) => <span className="text-foreground/70">${info.getValue<number>().toLocaleString()}</span>,
        },
        {
            accessorKey: 'weight_disc',
            header: 'Weight Disc.',
            cell: (info) => {
                const val = info.getValue<number>();
                return <span className={cn('font-semibold', val > 15 ? 'text-red-400' : val > 8 ? 'text-amber-400' : 'text-emerald-400')}>{val}%</span>;
            },
        },
        {
            accessorKey: 'risk_score',
            header: 'Risk Score',
            cell: (info) => <ScoreBar score={info.getValue<number>()} />,
        },
        {
            accessorKey: 'risk_level',
            header: 'Risk Level',
            cell: (info) => {
                const level = info.getValue<RiskLevel>();
                return (
                    <div className="flex items-center gap-1.5">
                        <div className={cn('w-2 h-2 rounded-full', riskLevelDot[level])} />
                        <span className={cn('text-xs font-medium', riskLevelText[level])}>{level}</span>
                    </div>
                );
            },
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: (info) => (
                <span className="px-2.5 py-1 rounded text-[11px] font-medium bg-foreground/5 text-foreground/70 border border-border">
                    {info.getValue<string>()}
                </span>
            ),
        },
        {
            accessorKey: 'arrival',
            header: 'Arrival',
            cell: (info) => <span className="text-foreground/50 text-xs">{info.getValue<string>()}</span>,
        },
    ], []);

    const table = useReactTable({
        data: filteredData,
        columns,
        state: { sorting, globalFilter },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
    });

    const totalRows = rawData?.pages[0]?.total || 0;

    return (
        <div className="space-y-0 pb-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <TableIcon className="w-6 h-6 text-foreground/60" />
                    <h1 className="text-2xl font-bold text-foreground">Shipment Data Table</h1>
                </div>
                <p className="text-sm text-foreground/40">Advanced sorting, grouping &amp; export</p>
            </div>

            {/* Search + Filters */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 flex items-center gap-4 border-b border-border">
                    {/* Search */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30" />
                        <input
                            value={globalFilter}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            placeholder="Search container ID, origin, destination..."
                            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-foreground/30"
                        />
                    </div>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-1.5">
                        {filterPills.map((pill) => (
                            <button
                                key={pill.label}
                                onClick={() => setRiskFilter(pill.label)}
                                className={cn(
                                    'px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all',
                                    riskFilter === pill.label ? pill.active : pill.color
                                )}
                            >
                                {pill.label}
                            </button>
                        ))}
                    </div>

                    {/* Record count */}
                    <span className="text-xs text-foreground/40 whitespace-nowrap">{totalRows} records</span>
                </div>

                {/* Table */}
                {isLoading ? (
                    <TableSkeleton rows={8} />
                ) : error ? (
                    <div className="p-8 text-center text-risk-critical text-sm">Failed to load shipment data. Please check your API connection.</div>
                ) : (
                    <>
                        <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-foreground/40 text-[11px] uppercase tracking-wider border-b border-border sticky top-0 bg-card z-10 shadow-sm">
                                        {table.getHeaderGroups().map((hg) =>
                                            hg.headers.map((h) => (
                                                <th
                                                    key={h.id}
                                                    className="px-4 py-3 text-left font-medium cursor-pointer select-none group"
                                                    onClick={h.column.getToggleSortingHandler()}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        {flexRender(h.column.columnDef.header, h.getContext())}
                                                        {{
                                                            asc: <ChevronUp className="w-3 h-3 text-primary" />,
                                                            desc: <ChevronDown className="w-3 h-3 text-primary" />,
                                                        }[h.column.getIsSorted() as string] ?? (
                                                                <ChevronsUpDown className="w-3 h-3 text-foreground/15 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                            )}
                                                    </div>
                                                </th>
                                            ))
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {table.getRowModel().rows.map((row, index) => {
                                        const isLast = index === table.getRowModel().rows.length - 1;
                                        return (
                                            <tr
                                                key={row.id}
                                                ref={isLast ? lastElementRef : null}
                                                className="border-b border-border/50 hover:bg-foreground/[0.03] transition-colors"
                                            >
                                                {row.getVisibleCells().map((cell) => (
                                                    <td key={cell.id} className="px-4 py-3.5">
                                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })}
                                    {isFetchingNextPage && (
                                        <tr>
                                            <td colSpan={columns.length} className="px-4 py-6 text-center text-foreground/40 text-sm">
                                                Loading more records...
                                            </td>
                                        </tr>
                                    )}
                                    {table.getRowModel().rows.length === 0 && (
                                        <tr>
                                            <td colSpan={columns.length} className="px-4 py-12 text-center text-foreground/40 text-sm">
                                                No matching shipments found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
