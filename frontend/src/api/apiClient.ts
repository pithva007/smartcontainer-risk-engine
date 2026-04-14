import axios from 'axios';

const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const defaultProdBase = 'https://smartcontainer-risk-engine-fwkw.vercel.app/api';
const baseURL = configuredBase || (import.meta.env.PROD ? defaultProdBase : '/api');

const apiClient = axios.create({
    baseURL,
    headers: {
        'Content-Type': 'application/json',
    },
});

if (import.meta.env.PROD && !configuredBase) {
    console.warn('[API] VITE_API_BASE_URL not set; falling back to default backend URL.');
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Inject JWT Bearer token on every request
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('sce_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor: handle errors + redirect on 401
apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        console.error('[API Error]', error?.response?.data || error.message);

        // Polling-heavy endpoints can hit 429 under serverless rate limits.
        // Retry with exponential backoff + jitter.
        if (error?.response?.status === 429 && error?.config) {
            const cfg = error.config as any;
            const retryCount = cfg.__retryCount || 0;

            if (retryCount < 3) {
                cfg.__retryCount = retryCount + 1;
                const retryAfterHeader = Number(error?.response?.headers?.['retry-after']);
                const retryAfterMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
                    ? retryAfterHeader * 1000
                    : 0;
                const backoffMs = retryAfterMs || Math.min(1000 * (2 ** retryCount), 10000) + Math.floor(Math.random() * 300);
                await wait(backoffMs);
                return apiClient(cfg);
            }
        }

        if (error?.response?.status === 401) {
            localStorage.removeItem('sce_token');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default apiClient;
