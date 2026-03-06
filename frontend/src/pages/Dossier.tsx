import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchContainerById } from '@/api/routes';
import { Printer, MapPin, Anchor, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Dossier() {
    const { id } = useParams<{ id: string }>();

    const { data: container, isLoading, isError } = useQuery({
        queryKey: ['container', id],
        queryFn: () => fetchContainerById(id!),
        enabled: !!id,
    });

    if (isLoading) {
        return <div className="p-8 flex justify-center text-foreground/50">Loading dossier...</div>;
    }

    if (isError || !container) {
        return <div className="p-8 flex justify-center text-red-500">Error loading case dossier or container not found.</div>;
    }

    const handlePrint = () => {
        window.print();
    };

    const isCritical = container.risk_level === 'Critical';

    // Mock measured value for demonstration since backend only has declared_value
    const measuredValue = container.declared_value ? Math.round(container.declared_value * (container.measured_weight / (container.declared_weight || 1))) : 0;

    const weightDelta = container.declared_weight ? ((container.measured_weight - container.declared_weight) / container.declared_weight) * 100 : 0;
    const valueDelta = container.declared_value ? ((measuredValue - container.declared_value) / container.declared_value) * 100 : 0;

    return (
        <div className="max-w-5xl mx-auto p-8 space-y-8 bg-white text-black min-h-screen relative print:p-0 print:m-0 print:space-y-6">

            {/* Header */}
            <header className="border-b-4 border-black pb-6 flex justify-between items-start">
                <div>
                    <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-1">Official Case Dossier</h4>
                    <h1 className="text-4xl font-mono font-bold tracking-tight">CONTAINER ID: {container.container_id}</h1>
                    <p className="text-sm mt-2 text-gray-600 font-mono">Generated: {new Date().toLocaleString()} | HS Code: {container.hs_code}</p>
                </div>
                {isCritical && (
                    <div className="border-4 border-red-600 text-red-600 font-bold text-3xl uppercase px-4 py-2 transform rotate-12 bg-red-50 print:border-red-600 print:text-red-600 drop-shadow-sm">
                        CRITICAL
                    </div>
                )}
            </header>

            {/* AI Briefing */}
            <section className="bg-gray-50 border border-gray-200 p-6 rounded-lg print:border-gray-300">
                <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    <h2 className="text-xl font-bold uppercase tracking-wide">Smart Summary</h2>
                </div>
                <div className="font-mono text-sm leading-relaxed p-4 bg-white border border-gray-300 shadow-inner rounded whitespace-pre-wrap">
                    {container.risk_explanation && container.risk_explanation.length > 0
                        ? container.risk_explanation.map((exp: string, i: number) => <span key={i}>&gt; {exp}<br /></span>)
                        : (container.explanation || `No specific anomalies detected. Risk Score: ${container.risk_score}`)}
                </div>
            </section>

            {/* Comparison Grid */}
            <section className="grid grid-cols-2 gap-6 print:gap-4">
                {/* Weight */}
                <div className="border border-gray-300 p-5 rounded-lg">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 border-b pb-2">Weight Analysis</h3>
                    <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                            <p className="text-xs text-gray-400 font-bold uppercase">Declared</p>
                            <p className="text-2xl font-mono">{container.declared_weight?.toLocaleString() ?? 0} <span className="text-sm text-gray-500">kg</span></p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 font-bold uppercase">Measured</p>
                            <p className="text-2xl font-mono">{container.measured_weight?.toLocaleString() ?? 0} <span className="text-sm text-gray-500">kg</span></p>
                        </div>
                    </div>
                    <div className={cn(
                        "mt-4 p-2 text-center rounded font-bold",
                        Math.abs(weightDelta) > 5 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"
                    )}>
                        Delta: {weightDelta > 0 ? '+' : ''}{weightDelta.toFixed(1)}%
                    </div>
                </div>

                {/* Value */}
                <div className="border border-gray-300 p-5 rounded-lg">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 border-b pb-2">Value Analysis</h3>
                    <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                            <p className="text-xs text-gray-400 font-bold uppercase">Declared</p>
                            <p className="text-2xl font-mono"><span className="text-sm text-gray-500">$</span>{container.declared_value?.toLocaleString() ?? 0}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 font-bold uppercase">Estimated</p>
                            <p className="text-2xl font-mono"><span className="text-sm text-gray-500">$</span>{measuredValue.toLocaleString()}</p>
                        </div>
                    </div>
                    <div className={cn(
                        "mt-4 p-2 text-center rounded font-bold",
                        Math.abs(valueDelta) > 10 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"
                    )}>
                        Delta: {valueDelta > 0 ? '+' : ''}{valueDelta.toFixed(1)}%
                    </div>
                </div>
            </section>

            {/* Route Snapshot */}
            <section className="border border-gray-300 rounded-lg p-6 bg-slate-50 print:bg-white">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-6">Route Map Snapshot</h3>
                <div className="flex items-center justify-between px-8 py-4 bg-white border border-gray-200 rounded shadow-sm">
                    <div className="text-center">
                        <MapPin className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="font-bold text-lg">{container.origin_country}</p>
                        <p className="text-xs text-gray-500 uppercase font-mono mt-1">Origin</p>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center px-4 relative">
                        <div className="w-full border-t-2 border-dashed border-gray-300 absolute top-1/2 transform -translate-y-1/2" />
                        <div className="bg-white px-3 py-1 text-xs font-mono font-bold text-gray-500 border border-gray-200 rounded-full relative z-10 flex items-center gap-2">
                            <Anchor className="w-3 h-3" />
                            Transit
                        </div>
                    </div>

                    <div className="text-center">
                        <MapPin className="w-8 h-8 text-indigo-600 mx-auto mb-2" />
                        <p className="font-bold text-lg">{container.destination_port || container.destination_country}</p>
                        <p className="text-xs text-gray-500 uppercase font-mono mt-1">Destination</p>
                    </div>
                </div>
            </section>

            {/* Admin Controls - Hidden on print */}
            <section className="print:hidden border-t-2 border-dashed border-gray-300 pt-6 mt-8 flex items-center justify-end">
                <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 border-2 border-gray-800 text-gray-800 hover:bg-gray-800 hover:text-white px-6 py-3 rounded-md font-bold transition-colors font-mono"
                >
                    <Printer className="w-5 h-5" />
                    Download Official PDF
                </button>
            </section>

        </div>
    );
}
