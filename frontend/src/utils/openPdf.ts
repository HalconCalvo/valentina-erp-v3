import axiosClient from '@/api/axios-client';

/**
 * Opens a PDF served by the API in a new tab with the normal session (Authorization header), never a token in the
 * URL. The tab opens before the request so the browser does not block it; if it is blocked anyway, the PDF downloads.
 */
export async function openApiPdf(path: string, fileName: string): Promise<void> {
    const tab = window.open('', '_blank');
    tab?.document.write('<p style="font-family:sans-serif;padding:40px;text-align:center;color:#64748b">Generando PDF...</p>');
    try {
        const response = await axiosClient.get(path, { responseType: 'blob' });
        const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
        if (tab) {
            tab.location.href = url;
        } else {
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            link.click();
        }
        window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (error) {
        tab?.close();
        throw error;
    }
}
