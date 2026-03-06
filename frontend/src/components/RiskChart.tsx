import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import type { RiskDistribution, AnomalyStat } from '@/types/apiTypes';
import { riskColor } from '@/lib/utils';

interface Props {
    riskData: RiskDistribution[];
    anomalyData: AnomalyStat[];
}

export default function RiskChart({ riskData, anomalyData }: Props) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Risk Distribution Pie */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-foreground mb-4">Risk Distribution</h3>
                <div className="h-72">
                    <ResponsiveContainer width="100%" height={288}>
                        <PieChart>
                            <Pie
                                data={riskData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={5}
                                dataKey="count"
                                nameKey="risk_level"
                                stroke="none"
                            >
                                {riskData.map((entry) => (
                                    <Cell key={entry.risk_level} fill={riskColor[entry.risk_level]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                            />
                            <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Anomaly Stats Bar */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-foreground mb-4">Anomaly Types</h3>
                <div className="h-72">
                    <ResponsiveContainer width="100%" height={288}>
                        <BarChart data={anomalyData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis
                                dataKey="type"
                                stroke="var(--foreground)"
                                opacity={0.5}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 12 }}
                            />
                            <YAxis stroke="var(--foreground)" opacity={0.5} tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                                cursor={{ fill: 'var(--border)', opacity: 0.4 }}
                            />
                            <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={36} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
