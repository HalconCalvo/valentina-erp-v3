import { useEffect } from 'react';
import { API_URL } from '../api/axios-client';
import { authService } from '../api/auth-service';

const HEARTBEAT_INTERVAL_MS = 60_000;

export function useHeartbeat() {
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            return undefined;
        }

        const sendHeartbeat = () => {
            authService.heartbeat().catch(() => {});
        };

        sendHeartbeat();
        const intervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

        const onBeforeUnload = () => {
            const currentToken = localStorage.getItem('token');
            if (!currentToken) {
                return;
            }
            fetch(`${API_URL}/users/logout`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${currentToken}` },
                keepalive: true,
            });
        };

        window.addEventListener('beforeunload', onBeforeUnload);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('beforeunload', onBeforeUnload);
        };
    }, []);
}
