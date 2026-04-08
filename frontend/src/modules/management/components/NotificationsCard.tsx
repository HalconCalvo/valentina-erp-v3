import React, { useState, useEffect } from 'react';
import { Bell, CheckCircle2, ShoppingCart, ArrowRight } from 'lucide-react';

// ---> RUTAS CORREGIDAS (Subimos 3 niveles hasta src/) <---
import { Card } from '@/components/ui/Card'; 
import api from '../../../api/axios-client'; 

export const NotificationsCard: React.FC = () => {
    const [tasks, setTasks] = useState({ pending_requisitions: 0, total_alerts: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTasks = async () => {
            try {
                // Usamos la instancia de axios de tu proyecto
                const response = await api.get('/purchases/notifications/pending-tasks');
                setTasks(response.data);
            } catch (error) {
                console.error("Error al cargar notificaciones:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchTasks();
        // Que se actualice solo cada 30 segundos
        const interval = setInterval(fetchTasks, 30000); 
        return () => clearInterval(interval);
    }, []);

    const hasAlerts = tasks.total_alerts > 0;

    return (
        <Card className={`relative overflow-hidden transition-all duration-300 w-full h-full ${hasAlerts ? 'border-orange-300 shadow-orange-100/50 shadow-lg' : 'border-emerald-200'}`}>
            {/* Cabecera */}
            <div className={`p-4 border-b flex justify-between items-center ${hasAlerts ? 'bg-orange-50 border-orange-100' : 'bg-emerald-50 border-emerald-100'}`}>
                <h3 className={`font-black flex items-center gap-2 ${hasAlerts ? 'text-orange-900' : 'text-emerald-900'}`}>
                    <Bell size={20} className={hasAlerts ? 'animate-bounce text-orange-500' : 'text-emerald-500'} /> 
                    Centro de Tareas
                </h3>
                {hasAlerts && (
                    <span className="bg-orange-600 text-white text-xs font-black px-2.5 py-1 rounded-full shadow-sm">
                        {tasks.total_alerts} Pendiente{tasks.total_alerts !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {/* Cuerpo */}
            <div className="p-5">
                {loading ? (
                    <p className="text-slate-400 text-sm font-bold animate-pulse text-center py-4">Escaneando radar...</p>
                ) : hasAlerts ? (
                    <div className="space-y-3">
                        {/* Alerta 1: Compras */}
                        {tasks.pending_requisitions > 0 && (
                            <div className="group flex items-center justify-between bg-white border border-orange-200 p-3 rounded-lg hover:border-orange-400 hover:shadow-md transition-all cursor-pointer">
                                <div className="flex items-center gap-3">
                                    <div className="bg-orange-100 p-2 rounded-md text-orange-600">
                                        <ShoppingCart size={18} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-800">Solicitudes Autorizadas</p>
                                        <p className="text-xs font-bold text-slate-500">Esperando asignar proveedor</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-black text-orange-600">{tasks.pending_requisitions}</span>
                                    <ArrowRight size={16} className="text-orange-300 group-hover:text-orange-600 transition-colors" />
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    // Estado Zen (Sin tareas)
                    <div className="flex flex-col items-center justify-center py-6 text-center h-full">
                        <div className="bg-emerald-100 p-3 rounded-full mb-3 text-emerald-600">
                            <CheckCircle2 size={32} />
                        </div>
                        <p className="font-black text-emerald-800">Todo al día</p>
                        <p className="text-sm font-medium text-emerald-600/70 mt-1">No tienes tareas urgentes en tu bandeja.</p>
                    </div>
                )}
            </div>
        </Card>
    );
};