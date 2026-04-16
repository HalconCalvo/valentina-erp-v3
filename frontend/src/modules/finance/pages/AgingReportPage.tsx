import { useLocation } from 'react-router-dom';
import { AccountsReceivableAgingPanel } from '../components/AccountsReceivableAgingPanel';

export const AgingReportPage = () => {
    const location = useLocation();
    const returnToPath = (location.state as { returnTo?: string } | null)?.returnTo;

    return <AccountsReceivableAgingPanel variant="page" returnToPath={returnToPath} />;
};

export default AgingReportPage;
