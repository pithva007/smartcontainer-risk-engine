import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { predictContainer } from '@/api/routes';
import type { PredictionInput, ContainerPrediction } from '@/types/apiTypes';
import { cn, riskBgClass, riskColor } from '@/lib/utils';
import { Crosshair, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

const defaultForm: PredictionInput = {
    Container_ID: '',
    Declaration_Date: '',
    Declaration_Time: '',
    Trade_Regime: '',
    Origin_Country: '',
    Destination_Country: '',
    Destination_Port: '',
    HS_Code: '',
    Importer_ID: '',
    Exporter_ID: '',
    Declared_Value: 0,
    Declared_Weight: 0,
    Measured_Weight: 0,
    Shipping_Line: '',
    Dwell_Time_Hours: 0,
    Clearance_Status: '',
};

const fields: { key: keyof PredictionInput; label: string; type: string }[] = [
    { key: 'Container_ID', label: 'Container ID', type: 'text' },
    { key: 'Declaration_Date', label: 'Declaration Date', type: 'date' },
    { key: 'Declaration_Time', label: 'Declaration Time', type: 'time' },
    { key: 'Trade_Regime', label: 'Trade Regime', type: 'text' },
    { key: 'Origin_Country', label: 'Origin Country', type: 'text' },
    { key: 'Destination_Country', label: 'Destination Country', type: 'text' },
    { key: 'Destination_Port', label: 'Destination Port', type: 'text' },
    { key: 'HS_Code', label: 'HS Code', type: 'text' },
    { key: 'Importer_ID', label: 'Importer ID', type: 'text' },
    { key: 'Exporter_ID', label: 'Exporter ID', type: 'text' },
    { key: 'Declared_Value', label: 'Declared Value ($)', type: 'number' },
    { key: 'Declared_Weight', label: 'Declared Weight (kg)', type: 'number' },
    { key: 'Measured_Weight', label: 'Measured Weight (kg)', type: 'number' },
    { key: 'Shipping_Line', label: 'Shipping Line', type: 'text' },
    { key: 'Dwell_Time_Hours', label: 'Dwell Time (Hours)', type: 'number' },
    { key: 'Clearance_Status', label: 'Clearance Status', type: 'text' },
];

export default function Predict() {
    const [form, setForm] = useState<PredictionInput>(defaultForm);
    const [result, setResult] = useState<ContainerPrediction | null>(null);

    const mutation = useMutation({
        mutationFn: (input: PredictionInput) => predictContainer(input),
        onSuccess: (data) => {
            setResult(data);
            toast.success('Prediction complete!');
        },
        onError: () => toast.error('Prediction failed.'),
    });

    const handleChange = (key: keyof PredictionInput, value: string) => {
        const numKeys = ['Declared_Value', 'Declared_Weight', 'Measured_Weight', 'Dwell_Time_Hours'];
        setForm((prev) => ({
            ...prev,
            [key]: numKeys.includes(key) ? parseFloat(value) || 0 : value,
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setResult(null);
        mutation.mutate(form);
    };

    return (
        <div className="space-y-8 pb-8 max-w-5xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Single Container Prediction</h1>
                <p className="text-sm text-foreground/60 mt-1">Manually enter container details to get a risk prediction.</p>
            </div>

            <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {fields.map((f) => (
                        <div key={f.key}>
                            <label className="block text-xs font-medium text-foreground/60 mb-1.5">{f.label}</label>
                            <input
                                type={f.type}
                                value={form[f.key]}
                                onChange={(e) => handleChange(f.key, e.target.value)}
                                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                                required={f.key === 'Container_ID'}
                            />
                        </div>
                    ))}
                </div>

                <div className="flex justify-end mt-6">
                    <button
                        type="submit"
                        disabled={mutation.isPending || !form.Container_ID}
                        className="px-6 py-2.5 bg-primary text-white font-medium rounded-md hover:bg-primary/90 disabled:opacity-40 text-sm flex items-center gap-2"
                    >
                        {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Predicting...</> : <><Crosshair className="w-4 h-4" /> Run Prediction</>}
                    </button>
                </div>
            </form>

            {/* Prediction Result */}
            {result && (
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5">
                    <h2 className="text-lg font-semibold text-foreground">Prediction Result</h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 bg-foreground/5 rounded-lg">
                            <p className="text-xs text-foreground/50 mb-1">Container ID</p>
                            <p className="font-semibold font-mono">{result.Container_ID}</p>
                        </div>
                        <div className="p-4 bg-foreground/5 rounded-lg">
                            <p className="text-xs text-foreground/50 mb-1">Risk Score</p>
                            <p className="font-bold text-xl">{result.Risk_Score.toFixed(2)}</p>
                            {/* Progress bar */}
                            <div className="w-full h-2 bg-foreground/10 rounded-full mt-2 overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{
                                        width: `${result.Risk_Score * 100}%`,
                                        backgroundColor: riskColor[result.Risk_Level],
                                    }}
                                />
                            </div>
                        </div>
                        <div className="p-4 bg-foreground/5 rounded-lg">
                            <p className="text-xs text-foreground/50 mb-1">Risk Level</p>
                            <span className={cn('px-3 py-1 rounded-full text-sm font-semibold', riskBgClass[result.Risk_Level])}>{result.Risk_Level}</span>
                        </div>
                        <div className="p-4 bg-foreground/5 rounded-lg">
                            <p className="text-xs text-foreground/50 mb-1">Anomaly</p>
                            <div className="flex items-center gap-1.5">
                                {result.Anomaly_Flag ? (
                                    <><AlertTriangle className="w-4 h-4 text-risk-critical" /><span className="font-semibold text-risk-critical">True</span></>
                                ) : (
                                    <><CheckCircle2 className="w-4 h-4 text-risk-clear" /><span className="font-semibold text-risk-clear">False</span></>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Explanation Summary */}
                    {result.Explanation_Summary && result.Explanation_Summary.length > 0 && (
                        <div className={cn(
                            'p-4 rounded-lg border text-sm space-y-2',
                            result.Risk_Level === 'Critical' ? 'bg-risk-critical/10 border-risk-critical/20' :
                                result.Risk_Level === 'Low Risk' ? 'bg-risk-low/10 border-risk-low/20' :
                                    'bg-risk-clear/10 border-risk-clear/20'
                        )}>
                            <p className="font-semibold text-foreground">Explanation</p>
                            <ul className="space-y-1 text-foreground/80">
                                {result.Explanation_Summary.map((s, i) => (
                                    <li key={i} className="flex items-start gap-2">
                                        <span className="mt-0.5">•</span>{s}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
