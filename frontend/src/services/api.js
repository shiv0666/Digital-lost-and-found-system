import axios from 'axios'
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '' })
api.interceptors.request.use(config => { const token = localStorage.getItem('token'); if (token) config.headers.Authorization = `Bearer ${token}`; return config })
api.interceptors.response.use(r => r, error => { if (error.response?.status === 401 && !['/auth/login','/auth/register'].includes(error.config?.url)) { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/login' } return Promise.reject(error) })
export const message = error => error.response?.data?.detail || error.message || 'Something went wrong'
