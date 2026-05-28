import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getInspector } from "../services/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function InspectorPage() {
  const { id } = useParams();
  const [inspector, setInspector] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getInspector(id);
        setInspector(data);
      } catch (err) {
        setError(err.response?.status === 404 ? "Inspector not found" : "Failed to load inspector");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  useEffect(() => {
    if (inspector) {
      document.title = `Inspector: ${inspector.inspector_name || inspector.inspector_id} - AWA Platform`;
    }
  }, [inspector]);

  if (loading) {
    return <div className="p-12 font-code-data text-on-surface-variant tracking-widest">INITIALIZING_DATALINK...</div>;
  }

  if (error) {
    return (
      <div className="p-12">
        <Link to="/" className="inline-flex items-center gap-2 text-on-surface-variant hover:text-secondary font-label-caps text-[12px] uppercase tracking-widest transition-colors no-underline mb-8 font-bold">
          <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to search
        </Link>
        <div className="font-code-data text-error tracking-widest">{error}</div>
      </div>
    );
  }

  // Aggregate facilities visited from inspector's inspections
  const facilitiesMap = {};
  inspector.inspections?.forEach((ins) => {
    if (!ins.facility_id) return;
    if (!facilitiesMap[ins.facility_id]) {
      facilitiesMap[ins.facility_id] = {
        id: ins.facility_id,
        name: ins.facility_name || "Unknown Facility",
        state: ins.facility_state || "—",
        inspections_count: 0,
        violations_count: 0,
      };
    }
    facilitiesMap[ins.facility_id].inspections_count += 1;
    facilitiesMap[ins.facility_id].violations_count += ins.violation_count || 0;
  });

  const facilitiesVisited = Object.values(facilitiesMap).sort((a, b) => b.violations_count - a.violations_count);

  return (
    <div className="p-12 max-w-[1440px] mx-auto relative z-10">
      
      <Link to="/" className="inline-flex items-center gap-2 text-on-surface-variant hover:text-secondary font-label-caps text-[12px] uppercase tracking-widest transition-colors no-underline mb-8 font-bold">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to search
      </Link>

      {/* Header Card */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-8 mb-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="m-0 text-[32px] font-headline-lg font-bold text-on-surface mb-2">{inspector.inspector_name || "Inspector Profile"}</h1>
          <p className="font-code-data text-[13px] text-on-surface-variant tracking-widest uppercase">
            Inspector ID: <strong className="text-on-surface">{inspector.inspector_id}</strong>
          </p>
        </div>
        <div className="md:text-right border-l border-outline-variant/10 pl-6">
          <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">TOTAL INSPECTIONS</p>
          <p className="font-headline-lg text-[32px] font-bold text-secondary">{inspector.total_inspections}</p>
        </div>
      </div>

      {/* Anomaly Banner */}
      {inspector.anomaly_flag && (
        <div className="bg-error/10 border border-error/20 rounded-xl p-4 flex items-center gap-3 mb-8 shadow-lg">
          <span className="material-symbols-outlined text-error">warning</span>
          <span className="font-label-caps text-[12px] font-bold text-error tracking-widest">
            Anomaly Detected: Non-compliance rate deviates significantly from the regional average
          </span>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-surface-container-low border border-outline-variant/10 rounded-2xl p-6">
          <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">NON-COMPLIANCE RATE</p>
          <p className="font-headline-md text-[24px] font-bold text-on-surface">{inspector.non_compliance_rate}%</p>
        </div>
        <div className="bg-surface-container-low border border-outline-variant/10 rounded-2xl p-6">
          <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">REGIONAL AVERAGE</p>
          <p className="font-headline-md text-[24px] font-bold text-on-surface">{inspector.regional_average_rate != null ? `${inspector.regional_average_rate}%` : "N/A"}</p>
        </div>
        <div className="bg-surface-container-low border border-outline-variant/10 rounded-2xl p-6">
          <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">PRIMARY STATE</p>
          <p className="font-headline-md text-[24px] font-bold text-secondary">{inspector.primary_state || "—"}</p>
        </div>
      </div>

      <div className="flex gap-8 flex-col lg:flex-row">
        
        {/* Left Column: Chart */}
        <div className="w-full lg:w-1/2">
          <h2 className="font-headline-md text-[24px] font-bold text-on-surface mb-6">Compliance Rate Comparison</h2>
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl mb-8">
            <div className="h-[300px]">
              {inspector.regional_average_rate != null ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={[
                      { name: "This Inspector", rate: inspector.non_compliance_rate },
                      { name: "Regional Average", rate: inspector.regional_average_rate }
                    ]} 
                    margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="rgba(255,255,255,0.5)" domain={[0, 100]} tickFormatter={(val) => `${val}%`} fontSize={11} tickLine={false} axisLine={false} dx={-10} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }} 
                      formatter={(val) => `${val}%`} 
                      contentStyle={{ backgroundColor: '#064e3b', borderColor: 'rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                      itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                    />
                    <Bar dataKey="rate" radius={[4, 4, 0, 0]} fill="#e9c349" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-on-surface-variant font-code-data tracking-widest text-[12px]">
                  REGIONAL COMPARISON DATA UNAVAILABLE
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Facilities */}
        <div className="w-full lg:w-1/2">
          <h2 className="font-headline-md text-[24px] font-bold text-on-surface mb-6">Facilities Inspected</h2>
          
          {facilitiesVisited.length > 0 ? (
            <div className="flex flex-col gap-4">
              {facilitiesVisited.map((fac) => (
                <div key={fac.id} className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-4 flex justify-between items-center hover:bg-surface-container-highest transition-colors">
                  <div>
                    <Link to={`/facility/${fac.id}`} className="font-headline-sm text-[16px] font-bold text-secondary hover:text-tertiary transition-colors no-underline">
                      {fac.name}
                    </Link>
                    <p className="font-code-data text-[12px] text-on-surface-variant mt-1">
                      State: <strong className="text-on-surface">{fac.state}</strong> • Visited <strong className="text-on-surface">{fac.inspections_count}</strong> time{fac.inspections_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div>
                    <span className={`px-3 py-1 rounded-full font-label-caps text-[10px] font-bold ${fac.violations_count > 5 ? 'bg-error/10 text-error border border-error/20' : fac.violations_count >= 2 ? 'bg-secondary/10 text-secondary border border-secondary/20' : 'bg-tertiary/10 text-tertiary border border-tertiary/20'}`}>
                      {fac.violations_count} VIOLATION{fac.violations_count !== 1 ? 'S' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-12 text-center font-code-data text-[12px] text-on-surface-variant tracking-widest">
              NO FACILITIES INSPECTED
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
