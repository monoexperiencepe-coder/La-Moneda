import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { gastosOperativosSolamente } from '../../utils/cajaNegocio';
import { REPORTES_SECTION_CARDS, type ReportesSectionId } from './reportesSections';
import RendimientoMensualSection from './sections/RendimientoMensualSection';
import RentabilidadVehiculoSection from './sections/RentabilidadVehiculoSection';
import GastosOperativosSection from './sections/GastosOperativosSection';
import IngresosReporteSection from './sections/IngresosReporteSection';
import PrestamosAportesSection from './sections/PrestamosAportesSection';
import ExportarSection from './sections/ExportarSection';
import UtilidadAcumuladaSection from './sections/UtilidadAcumuladaSection';

const VALID_SECTIONS = new Set<ReportesSectionId>(
  REPORTES_SECTION_CARDS.map((c) => c.id),
);

function parseSectionParam(raw: string | null): ReportesSectionId | null {
  if (!raw || !VALID_SECTIONS.has(raw as ReportesSectionId)) return null;
  return raw as ReportesSectionId;
}

const ReportesHub: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const panelRef = useRef<HTMLDivElement>(null);
  const { ingresos, gastos, descuentos, vehicles, cajaNegocioVehiculo } = useRegistrosContext();

  const [activeSection, setActiveSection] = useState<ReportesSectionId | null>(() =>
    parseSectionParam(searchParams.get('seccion')),
  );

  useEffect(() => {
    const fromUrl = parseSectionParam(searchParams.get('seccion'));
    if (fromUrl !== activeSection) setActiveSection(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync URL → state only when searchParams change
  }, [searchParams]);

  const yearOptions = useMemo(() => {
    const gastosOp = gastosOperativosSolamente(gastos);
    const ys = new Set<number>();
    const touch = (fecha: string) => {
      const y = Number(String(fecha).slice(0, 4));
      if (Number.isFinite(y) && y > 0) ys.add(y);
    };
    for (const i of ingresos) touch(i.fecha);
    for (const g of gastosOp) touch(g.fecha);
    for (const d of descuentos) touch(d.fecha);
    const sorted = [...ys].sort((a, b) => b - a);
    if (sorted.length === 0) sorted.push(new Date().getFullYear());
    return sorted;
  }, [ingresos, gastos, descuentos]);

  const openSection = (id: ReportesSectionId) => {
    setActiveSection(id);
    setSearchParams({ seccion: id }, { replace: true });
    requestAnimationFrame(() => {
      const el = panelRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - 88;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
  };

  const closeSection = () => {
    setActiveSection(null);
    setSearchParams({}, { replace: true });
  };

  const activeCard = REPORTES_SECTION_CARDS.find((c) => c.id === activeSection);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10 animate-fade-in">
      <header className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate('/finanzas')}
          className="mt-0.5 shrink-0 rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100"
          aria-label="Volver a Finanzas"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600/90">Finanzas</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Centro de análisis</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-600">
            Explora el comportamiento financiero del negocio. Para el estado actual del período, usa{' '}
            <Link
              to="/finanzas/resumen"
              className="font-semibold text-violet-700 underline decoration-violet-300 underline-offset-2"
            >
              Resumen
            </Link>
            .
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {REPORTES_SECTION_CARDS.map((card) => {
          const Icon = card.icon;
          const isActive = activeSection === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => openSection(card.id)}
              className={`group flex flex-col rounded-2xl border bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${card.accent} ${
                isActive ? 'ring-2 ring-violet-400/60 ring-offset-1' : ''
              }`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.iconBg}`}>
                  <Icon size={20} />
                </span>
                <ChevronRight
                  size={18}
                  className="mt-1 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-500"
                />
              </span>
              <span className="mt-3 font-bold text-slate-900">{card.title}</span>
              <span className="mt-1 text-sm leading-snug text-slate-500">{card.description}</span>
            </button>
          );
        })}
      </div>

      {activeSection && activeCard ? (
        <div
          ref={panelRef}
          className="scroll-mt-24 rounded-2xl border border-violet-200/60 bg-white p-4 shadow-lg shadow-violet-100/40 transition-all duration-300 sm:p-6"
        >
          <button
            type="button"
            onClick={closeSection}
            className="mb-4 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <ChevronLeft size={14} />
            Volver al menú
          </button>

          {activeSection === 'mensual' ? (
            <RendimientoMensualSection ingresos={ingresos} gastos={gastos} descuentos={descuentos} />
          ) : null}
          {activeSection === 'vehiculos' ? (
            <RentabilidadVehiculoSection
              vehicles={vehicles}
              ingresos={ingresos}
              gastos={gastos}
              descuentos={descuentos}
              yearOptions={yearOptions}
            />
          ) : null}
          {activeSection === 'utilidad' ? (
            <UtilidadAcumuladaSection
              vehicles={vehicles}
              ingresos={ingresos}
              gastos={gastos}
              cajaNegocioVehiculo={cajaNegocioVehiculo}
              yearOptions={yearOptions}
            />
          ) : null}
          {activeSection === 'gastos_op' ? (
            <GastosOperativosSection gastos={gastos} vehicles={vehicles} yearOptions={yearOptions} />
          ) : null}
          {activeSection === 'ingresos' ? (
            <IngresosReporteSection ingresos={ingresos} vehicles={vehicles} yearOptions={yearOptions} />
          ) : null}
          {activeSection === 'financiamiento' ? <PrestamosAportesSection /> : null}
          {activeSection === 'exportar' ? (
            <ExportarSection ingresos={ingresos} gastos={gastos} descuentos={descuentos} />
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3 text-center text-sm text-slate-500">
          Elige un análisis arriba para ver gráficos, rankings y exportaciones.
        </p>
      )}
    </div>
  );
};

export default ReportesHub;
