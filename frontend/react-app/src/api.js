import axios from 'axios';

// Base URL can be overridden by VITE_API_BASE_URL env; proxy in vite.config handles localhost.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json'
  }
});

export default api;
