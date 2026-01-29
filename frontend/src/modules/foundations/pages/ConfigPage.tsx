import React, { useState, useEffect, useRef } from 'react';
import { useFoundations } from '../hooks/useFoundations';
import client from '../../../api/axios-client'; 
import { 
    Save, Percent, Calendar, Ruler, Building2, MapPin, 
    Phone, Globe, FileText, Image as ImageIcon, AlertCircle, 
    UploadCloud, Target, TrendingUp, DollarSign 
} from 'lucide-react';
import { GlobalConfig } from '../../../types/foundations';

export default function ConfigPage() {
  
  // Hook personalizado para lógica de negocio
  const { config, taxRates, loading, error, saving, updateConfig } = useFoundations();
  
  // Referencias para la carga de archivos
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // --- 1. ESTADOS: IDENTIDAD CORPORATIVA ---
  const [companyName, setCompanyName] = useState('');
  const [logoPath, setLogoPath] = useState('');
  const [companyRfc, setCompanyRfc] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');

  // --- 2. ESTADOS: FINANCIEROS Y TÉCNICOS ---
  const [marginInput, setMarginInput] = useState('');
  const [toleranceInput, setToleranceInput] = useState('');
  const [daysInput, setDaysInput] = useState('');
  const [edgeFactorInput, setEdgeFactorInput] = useState('');
  const [selectedTax, setSelectedTax] = useState<number>(0);

  // --- 3. METAS FINANCIERAS (Dashboard) ---
  const [annualTarget, setAnnualTarget] = useState('');
  const [lastYearSales, setLastYearSales] = useState('');

  // --- UTILERIAS DE FORMATO MONEDA ---
  const formatMoney = (value: string | number) => {
    if (!value) return '';
    const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    if (isNaN(num)) return '';
    // Formato México (MXN) con comas y 2 decimales
    return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
  };

  const unformatMoney = (value: string) => {
    return value.replace(/,/g, '');
  };

  // --- 4. CARGA DE DATOS INICIAL ---
  useEffect(() => {
    if (config) {
      // Identidad
      setCompanyName(config.company_name || '');
      setLogoPath(config.logo_path || ''); 
      setCompanyRfc(config.company_rfc || '');
      setCompanyAddress(config.company_address || '');
      setCompanyPhone(config.company_phone || '');
      setCompanyEmail(config.company_email || '');
      setCompanyWebsite(config.company_website || '');

      // Financieros Operativos
      setMarginInput((config.target_profit_margin * 100).toFixed(0));
      setToleranceInput((config.cost_tolerance_percent * 100).toFixed(0));
      setDaysInput(config.quote_validity_days.toString());
      setEdgeFactorInput(config.default_edgebanding_factor.toString());
      
      // Metas (Aplicamos formato visual al cargar)
      setAnnualTarget(config.annual_sales_target ? formatMoney(config.annual_sales_target) : '');
      setLastYearSales(config.last_year_sales ? formatMoney(config.last_year_sales) : '');

      // Impuestos
      if (config.default_tax_rate_id) {
        setSelectedTax(config.default_tax_rate_id);
      } else if (taxRates && taxRates.length > 0) {
        const firstActive = taxRates.find(t => t.is_active);
        if (firstActive) setSelectedTax(firstActive.id || 0);
      }
    }
  }, [config, taxRates]);

  // --- 5. LÓGICA DE SUBIDA DE ARCHIVO ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await client.post('/foundations/config/upload-logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setLogoPath(data.url); 
    } catch (error) {
      console.error("Error upload:", error);
      alert("Error al subir el logo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- 6. GUARDADO GENERAL ---
  const handleSave = async () => {
    const margin = Number(marginInput);
    const tolerance = Number(toleranceInput);
    const days = Number(daysInput);
    const edgeFactor = Number(edgeFactorInput);
    
    // Limpiamos las comas antes de convertir a número para guardar
    const annualTargetNum = annualTarget ? parseFloat(unformatMoney(annualTarget)) : 0;
    const lastYearSalesNum = lastYearSales ? parseFloat(unformatMoney(lastYearSales)) : 0;

    if (isNaN(margin) || isNaN(tolerance) || isNaN(days) || isNaN(edgeFactor)) {
        alert("Por favor revisa los campos numéricos.");
        return;
    }
    
    const updatedData: Partial<GlobalConfig> = {
        company_name: companyName,
        logo_path: logoPath,
        company_rfc: companyRfc,
        company_address: companyAddress,
        company_phone: companyPhone,
        company_email: companyEmail,
        company_website: companyWebsite,
        target_profit_margin: margin / 100,
        cost_tolerance_percent: tolerance / 100,
        quote_validity_days: days,
        default_edgebanding_factor: edgeFactor,
        default_tax_rate_id: selectedTax,
        annual_sales_target: annualTargetNum,
        last_year_sales: lastYearSalesNum
    };

    try {
        await updateConfig(updatedData as GlobalConfig); 
        alert("✅ Configuración guardada correctamente.");
        window.location.reload(); 
    } catch (err) {
        console.error("Error al guardar:", err);
        alert("❌ Ocurrió un error al guardar.");
    }
  };

  if (loading) return <div className="p-10 text-center animate-pulse">Cargando configuración...</div>;
  if (error) return <div className="p-10 text-center text-red-600"><AlertCircle className="inline"/> {error}</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex justify-between items-center pb-4 border-b border-slate-200">
        <div>
            <h1 className="text-2xl font-bold text-slate-900">Configuración Maestra</h1>
            <p className="text-sm text-slate-500">Parámetros globales de Identidad y Reglas de Negocio.</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-slate-900 text-white px-6 py-2.5 rounded-lg hover:bg-slate-800 font-medium shadow-lg transition-all active:scale-95 disabled:opacity-50">
          <Save size={18} /> {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* IDENTIDAD */}
        <div className="lg:col-span-1 space-y-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Building2 className="text-blue-600" /> Identidad Corporativa
            </h3>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-5">
                <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="relative mb-3 group">
                        {logoPath ? (
                            <img src={logoPath} alt="Logo" className="w-24 h-24 object-contain rounded-md bg-white border border-slate-100 shadow-sm" onError={(e) => (e.currentTarget.src = "https://via.placeholder.com/150?text=Sin+Logo")} />
                        ) : (
                            <div className="w-24 h-24 flex items-center justify-center bg-slate-200 rounded-md text-slate-400"><ImageIcon size={32} /></div>
                        )}
                        {uploading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-md"><span className="text-xs font-bold text-blue-600 animate-pulse">Subiendo...</span></div>}
                    </div>
                    <div className="w-full text-center">
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="text-xs flex items-center justify-center gap-2 mx-auto bg-white border border-slate-300 text-slate-700 font-bold py-1.5 px-3 rounded hover:bg-slate-50 transition-all shadow-sm">
                           <UploadCloud size={14} /> {uploading ? 'Cargando...' : 'Cambiar Logo'}
                        </button>
                    </div>
                </div>
                <div><label className="label-std">Nombre Empresa</label><input className="input-std" value={companyName} onChange={e => setCompanyName(e.target.value)} /></div>
                <div><label className="label-std">RFC / Tax ID</label><input className="input-std" value={companyRfc} onChange={e => setCompanyRfc(e.target.value)} /></div>
                <div><label className="label-std">Dirección</label><textarea className="input-std h-20 resize-none" value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} /></div>
                <div><label className="label-std">Teléfono</label><input className="input-std" value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} /></div>
                <div><label className="label-std">Email</label><input className="input-std" value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} /></div>
                <div><label className="label-std">Sitio Web</label><input className="input-std" value={companyWebsite} onChange={e => setCompanyWebsite(e.target.value)} /></div>
            </div>
        </div>

        {/* OPERATIVO */}
        <div className="lg:col-span-2 space-y-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Percent className="text-emerald-600" /> Reglas de Negocio</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card-std">
                    <div className="flex items-start justify-between mb-4"><h2 className="text-base font-bold text-slate-700">Margen</h2><span className="badge-blue">Finanzas</span></div>
                    <div className="relative"><input type="number" value={marginInput} onChange={(e) => setMarginInput(e.target.value)} className="input-large border-blue-200 focus:border-blue-500" /><span className="unit-label">%</span></div>
                </div>
                <div className="card-std">
                    <div className="flex items-start justify-between mb-4"><h2 className="text-base font-bold text-slate-700">Tolerancia</h2><span className="badge-orange">Seguridad</span></div>
                    <div className="relative"><input type="number" value={toleranceInput} onChange={(e) => setToleranceInput(e.target.value)} className="input-large border-orange-200 focus:border-orange-500" /><span className="unit-label">%</span></div>
                </div>
                <div className="card-std">
                    <div className="flex items-start justify-between mb-4"><h2 className="text-base font-bold text-slate-700">Vigencia</h2><Calendar size={18} className="text-slate-400"/></div>
                    <div className="relative"><input type="number" value={daysInput} onChange={(e) => setDaysInput(e.target.value)} className="input-large border-indigo-200 focus:border-indigo-500" /><span className="absolute right-0 top-4 text-sm font-bold text-slate-400">Días</span></div>
                </div>
                <div className="card-std">
                     <div className="flex items-start justify-between mb-4"><h2 className="text-base font-bold text-slate-700">IVA Default</h2><span className="badge-blue">Fiscal</span></div>
                    <select value={selectedTax} onChange={(e) => setSelectedTax(Number(e.target.value))} className="w-full p-2 bg-slate-50 border border-slate-200 rounded h-12 outline-none">
                        <option value={0} disabled>-- Selecciona --</option>
                        {taxRates && taxRates.map(tax => (<option key={tax.id} value={tax.id}>{tax.name} ({(tax.rate * 100).toFixed(0)}%)</option>))}
                    </select>
                </div>
                <div className="card-std md:col-span-2 border-l-4 border-l-purple-500">
                    <div className="flex items-start justify-between">
                        <div><h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Ruler size={18} className="text-purple-600"/> Factor Tapacanto</h2><p className="helper-text mt-1">Metros lineales promedio por Hoja.</p></div>
                        <div className="relative w-32"><input type="number" value={edgeFactorInput} onChange={(e) => setEdgeFactorInput(e.target.value)} className="input-large border-purple-200 focus:border-purple-500 text-right" /><span className="absolute right-0 -bottom-5 text-xs font-bold text-slate-400">ml / Hoja</span></div>
                    </div>
                </div>
            </div>

            {/* SECCIÓN METAS FINANCIERAS (MODIFICADA) */}
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 pt-6 border-t border-slate-200"><Target className="text-purple-600" /> Metas Financieras</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* META ANUAL */}
                <div className="bg-purple-50 p-5 rounded-xl border border-purple-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><Target size={60} className="text-purple-600"/></div>
                    <label className="block text-xs font-bold text-purple-800 uppercase mb-2">Meta Ventas {new Date().getFullYear()}</label>
                    <div className="relative">
                        <DollarSign size={20} className="absolute left-0 top-3 text-purple-400"/>
                        <input 
                            type="text" 
                            className="w-full pl-6 bg-transparent text-3xl font-bold text-purple-900 border-b-2 border-purple-200 focus:border-purple-500 outline-none" 
                            value={annualTarget} 
                            onChange={e => setAnnualTarget(e.target.value)} 
                            onFocus={() => setAnnualTarget(unformatMoney(annualTarget))}
                            onBlur={() => setAnnualTarget(formatMoney(annualTarget))}
                        />
                    </div>
                </div>

                {/* VENTAS AÑO ANTERIOR */}
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><TrendingUp size={60} className="text-slate-600"/></div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Ventas Año Anterior</label>
                    <div className="relative">
                        <DollarSign size={20} className="absolute left-0 top-3 text-slate-400"/>
                        <input 
                            type="text" 
                            className="w-full pl-6 bg-transparent text-3xl font-bold text-slate-700 border-b-2 border-slate-300 focus:border-slate-500 outline-none" 
                            value={lastYearSales} 
                            onChange={e => setLastYearSales(e.target.value)} 
                            onFocus={() => setLastYearSales(unformatMoney(lastYearSales))}
                            onBlur={() => setLastYearSales(formatMoney(lastYearSales))}
                        />
                    </div>
                </div>

            </div>
        </div>
      </div>
      <style>{`.label-std { display: block; font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 0.25rem; } .input-std { width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.5rem; font-size: 0.875rem; outline: none; transition: all 0.2s; } .input-std:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); } .card-std { background-color: white; padding: 1.25rem; border-radius: 0.75rem; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; } .badge-blue { background-color: #eff6ff; color: #1d4ed8; padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.6875rem; font-weight: 700; } .badge-orange { background-color: #fff7ed; color: #c2410c; padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.6875rem; font-weight: 700; } .input-large { width: 100%; font-size: 2.25rem; font-weight: 700; color: #1e293b; border-bottom-width: 2px; padding-top: 0.25rem; padding-bottom: 0.25rem; outline: none; background-color: transparent; } .unit-label { position: absolute; right: 0; top: 0.75rem; font-size: 1.25rem; font-weight: 700; color: #94a3b8; } .helper-text { font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem; }`}</style>
    </div>
  );
};