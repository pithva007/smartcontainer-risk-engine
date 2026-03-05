import axios from 'axios';

const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

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
    (error) => {
        console.error('[API Error]', error?.response?.data || error.message);
        if (error?.response?.status === 401) {
            localStorage.removeItem('sce_token');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default apiClient;
