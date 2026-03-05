import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    getPaginationRowModel,
    useReactTable,
    type SortingState,
    type ColumnDef,
} from '@tanstack/react-table';
import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import type { RecentHighRisk } from '@/types/apiTypes';
import { cn, riskRowClass, riskBgClass } from '@/lib/utils';

interface Props {
    data: RecentHighRisk[];
}

export default function ContainerTable({ data }: Props) {
    const [sorting, setSorting] = useState<SortingState>([]);

    const columns = useMemo<ColumnDef<RecentHighRisk>[]>(() => [
        { accessorKey: 'container_id', header: 'Container ID', cell: (info) => <span className="font-medium">{info.getValue<string>()}</span> },
        {
            accessorKey: 'risk_score',
            header: 'Risk Score',
            cell: (info) => {
                const val = info.getValue<number>();
                return <span className="font-mono">{val.toFixed(2)}</span>;
            },
        },
        {
            accessorKey: 'risk_level',
            header: 'Risk Level',
            cell: (info) => {
                const level = info.getValue<RecentHighRisk['risk_level']>();
                return <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', riskBgClass[level])}>{level}</span>;
            },
        },
        {
            accessorKey: 'processed_at',
            header: 'Processed At',
            cell: (info) => new Date(info.getValue<string>()).toLocaleString(),
        },
    ], []);

    const table = useReactTable({
        data,
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: { pagination: { pageSize: 10 } },
    });

    return (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase text-foreground/60 bg-foreground/5">
                        {table.getHeaderGroups().map((hg) => (
                            <tr key={hg.id}>
                                {hg.headers.map((h) => (
                                    <th
                                        key={h.id}
                                        className="px-4 py-3 font-medium cursor-pointer select-none border-b border-border group"
                                        onClick={h.column.getToggleSortingHandler()}
                                    >
                                        <div className="flex items-center gap-1">
                                            {flexRender(h.column.columnDef.header, h.getContext())}
                                            {{
                                                asc: <ChevronUp className="w-3 h-3 text-primary" />,
                                                desc: <ChevronDown className="w-3 h-3 text-primary" />,
                                            }[h.column.getIsSorted() as string] ?? (
                                                    <ChevronsUpDown className="w-3 h-3 text-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {table.getRowModel().rows.map((row) => (
                            <tr
                                key={row.id}
                                className={cn('border-b border-border transition-colors', riskRowClass[row.original.risk_level])}
                            >
                                {row.getVisibleCells().map((cell) => (
                                    <td key={cell.id} className="px-4 py-3">
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="p-3 border-t border-border flex items-center justify-between text-sm">
                <span className="text-foreground/60">
                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                </span>
                <div className="flex gap-2">
                    <button
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                        className="px-3 py-1 border border-border rounded text-sm disabled:opacity-40 hover:bg-foreground/5"
                    >Previous</button>
                    <button
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                        className="px-3 py-1 border border-border rounded text-sm disabled:opacity-40 hover:bg-foreground/5"
                    >Next</button>
                </div>
            </div>
        </div>
    );
}
