/**
 * Re-export desde el panel único de antigüedad (V5.6) para no duplicar lógica.
 * @see src/modules/finance/components/AccountsReceivableAgingPanel.tsx
 */
export {
    loadSalesOrdersWithAdministrationAgingCxc,
    sumAgingCxcFromOrders,
    aggregateCarteraMonitorTotals,
    buildCarteraMonitorRows,
    orderEligibleForCarteraMonitor,
    mergePendingCustomerPaymentsIntoOrders,
    isSellerLikeRole,
    type CarteraMonitorRow,
} from '../../finance/components/AccountsReceivableAgingPanel';
