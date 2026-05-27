import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getFacility } from "../services/api";
import PDFViewer from "../components/PDFViewer";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase().replace(/ /g, "_");
}

const USE_MOCK_DATA = false;

const mockFacilityData = {
  id: "9999",
  name: "WEST COAST GAME PARK INC",
  certificate_number: "92-C-0181",
  license_status: "ACTIVE",
  address: "46914 HWY. 101 SOUTH BANDON",
  city: "Bandon",
  state: "OR",
  zip_code: "97411",
  license_type: "Class C (Exhibitor)",
  risk_flags: {
    exceeds_animal_limit: false,
    high_direct_violations: true,
    inventory_spike: false
  },
  inspections: [
    {
      id: "insp_1",
      inspection_date: "2025-04-22T00:00:00Z",
      inspection_type: "FOCUSED INSPECTION",
      inspector_id: "insp_001",
      inspector_name: "Ashley Alger",
      violation_count: 1,
      source_pdf: "https://dnxuxbmhaalwsyjmdbee.supabase.co/storage/v1/object/public/raw_pdfs/mock_pdf.pdf",
      source_pdf_path: "44eba65f93ae0974.pdf",
      inventory: [
        { id: "inv_1", count: 2, common_name: "SERVAL", scientific_name: "Leptailurus serval" },
        { id: "inv_2", count: 1, common_name: "TIGER", scientific_name: "Panthera tigris" },
        { id: "inv_3", count: 4, common_name: "LION", scientific_name: "Panthera leo" },
        { id: "inv_4", count: 1, common_name: "JAGUAR", scientific_name: "Panthera onca" },
        { id: "inv_5", count: 2, common_name: "LEOPARD", scientific_name: "Panthera pardus" },
        { id: "inv_6", count: 1, common_name: "CANADIAN LYNX", scientific_name: "Lynx canadensis" }
      ],
      violations: [
        { id: "v_1", section: "CODE_2.31(c)(3)", severity: "Critical", description: "No violations recorded for this inspection. (Mock data override)" }
      ]
    },
    {
      id: "insp_2",
      inspection_date: "2025-04-01T00:00:00Z",
      inspection_type: "FOCUSED INSPECTION",
      inspector_id: "insp_002",
      inspector_name: "DARREN RAUSCH",
      violation_count: 0,
      source_pdf: null,
      source_pdf_path: null,
      inventory: [],
      violations: []
    }
  ],
  inventory_history: [
    { inspection_date: "2022-05-10", total_animals: 110 },
    { inspection_date: "2023-10-15", total_animals: 115 }
  ]
};

function InspectionAccordion({ inspection, onOpenPdf }) {
  const [expanded, setExpanded] = useState(false);
  const hasViolations = inspection.violation_count > 0;
  
  let filename = inspection.source_pdf_path ? inspection.source_pdf_path.split('/').pop() : null;
  if (filename && !filename.endsWith('.pdf')) filename += '.pdf';
  const pdfUrl = filename ? `https://dnxuxbmhaalwsyjmdbee.supabase.co/storage/v1/object/public/raw_pdfs/${filename}` : inspection.source_pdf;

  return (
    <div className={`bg-surface-container-low border border-outline-variant/10 rounded-2xl overflow-hidden mb-6 flex`}>
      {/* Left indicator bar */}
      <div className={`w-1.5 ${hasViolations ? 'bg-error' : 'bg-tertiary'}`}></div>
      
      <div className="flex-1 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-4">
          <div>
            <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">INSPECTION DATE</p>
            <p className="font-headline-sm text-[16px] font-bold text-on-surface">{formatDate(inspection.inspection_date)}</p>
          </div>
          <div>
            <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">TYPE</p>
            <p className="font-code-data text-[13px] text-on-surface">{inspection.inspection_type}</p>
          </div>
          <div>
            <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">INSPECTOR</p>
            <p className="font-code-data text-[13px] text-secondary font-bold uppercase">{inspection.inspector_name}</p>
          </div>
          <div>
            <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">VIOLATIONS</p>
            {hasViolations ? (
              <span className="bg-error/10 text-error border border-error/20 px-3 py-1 rounded-full font-label-caps text-[11px] font-bold inline-block">
                {inspection.violation_count} VIOLATION{inspection.violation_count !== 1 ? 'S' : ''}
              </span>
            ) : (
              <span className="bg-tertiary/10 text-tertiary border border-tertiary/20 px-3 py-1 rounded-full font-label-caps text-[11px] font-bold inline-block">
                0 VIOLATIONS
              </span>
            )}
          </div>
        </div>

        <button 
          onClick={() => setExpanded(!expanded)} 
          className="bg-transparent border-none text-on-surface-variant hover:text-secondary cursor-pointer p-2 flex items-center justify-center transition-colors -ml-2 rounded-full hover:bg-surface-variant/20"
        >
          <span className="material-symbols-outlined text-[20px]">{expanded ? 'arrow_drop_up' : 'arrow_drop_down'}</span>
        </button>

        {expanded && (
          <div className="mt-4 pt-6 border-t border-outline-variant/10 animate-fade-in">
            {pdfUrl && (
              <button 
                onClick={() => onOpenPdf(pdfUrl, formatDate(inspection.inspection_date))}
                className="bg-primary-container text-on-primary-container border border-primary/20 px-4 py-2.5 rounded-lg flex items-center gap-2 font-label-caps text-[11px] font-bold uppercase tracking-widest hover:brightness-110 transition-all mb-8 shadow-md"
              >
                <span className="material-symbols-outlined text-[16px]">description</span> Open Report
              </button>
            )}

            <div className="mb-8">
              <h4 className="font-headline-sm text-[16px] text-on-surface mb-4">Animal Inventory List</h4>
              {inspection.inventory && inspection.inventory.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {inspection.inventory.map(inv => (
                    <div key={inv.id} className="border border-outline-variant/20 bg-surface-container-highest px-3 py-1.5 rounded-lg flex items-center gap-2">
                      <span className="font-code-data text-[12px] font-bold text-on-surface">{inv.count}</span>
                      <span className="font-code-data text-[11px] text-on-surface-variant uppercase tracking-wider">{inv.common_name}</span>
                      <span className="font-code-data text-[11px] text-on-surface-variant/50 italic">({inv.scientific_name})</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-body-md text-on-surface-variant text-[14px]">No inventory recorded for this inspection.</p>
              )}
            </div>

            <div>
              <h4 className="font-headline-sm text-[16px] text-on-surface mb-4">Detailed Violations</h4>
              {inspection.violations && inspection.violations.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {inspection.violations.map(v => (
                    <div key={v.id} className="border border-outline-variant/10 bg-surface-container-highest p-4 rounded-lg">
                      <p className="font-body-md text-on-surface-variant text-[14px] leading-relaxed mb-0">
                        {v.description}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-body-md text-on-surface-variant text-[14px] italic">No violations recorded for this inspection.</p>
              )}
            </div>
            
            {filename && (
              <p className="mt-8 font-code-data text-[11px] text-on-surface-variant tracking-widest">
                Source file: <span className="text-secondary font-bold">{filename}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FacilityPage() {
  const { id } = useParams();
  const [facility, setFacility] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePdf, setActivePdf] = useState(null);
  const [activePdfDate, setActivePdfDate] = useState(null);

  useEffect(() => {
    async function load() {
      if (USE_MOCK_DATA) {
        setFacility(mockFacilityData);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await getFacility(id);
        setFacility(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return <div className="p-12 font-code-data text-on-surface-variant tracking-widest">INITIALIZING_DATALINK...</div>;
  }
  if (!facility) {
    return <div className="p-12 font-code-data text-error tracking-widest">ERR_NO_FACILITY_FOUND</div>;
  }

  const openPdfViewer = (url, dateStr) => {
    setActivePdf(url);
    setActivePdfDate(dateStr);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closePdfViewer = () => {
    setActivePdf(null);
    setActivePdfDate(null);
  };

  return (
    <div className="p-12 mx-auto relative z-10 transition-all duration-300">
      
      {/* Back Button */}
      <Link to="/" className="inline-flex items-center gap-2 text-on-surface-variant hover:text-secondary font-label-caps text-[12px] uppercase tracking-widest transition-colors no-underline mb-8 font-bold">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to search
      </Link>

      <div className={`flex gap-8 transition-all duration-300 ${activePdf ? 'w-full' : 'max-w-[1000px]'}`}>
        
        {/* Main Content Area */}
        <div className={`flex flex-col transition-all duration-300 ${activePdf ? 'w-1/2' : 'w-full'}`}>
          
          {/* Facility Header Card */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-8 mb-8 shadow-xl">
            <h1 className="m-0 text-[32px] font-headline-lg font-bold text-on-surface mb-2">{facility.name}</h1>
            <p className="font-code-data text-[13px] text-on-surface-variant tracking-widest uppercase mb-8">
              Certificate: <strong className="text-on-surface">{facility.certificate_number}</strong>
            </p>
            
            <div className="border-t border-outline-variant/10 pt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">ADDRESS DETAILS</p>
                <p className="font-body-md text-[14px] text-on-surface leading-snug">
                  {facility.address}<br/>
                  {facility.city}, {facility.state} {facility.zip_code}
                </p>
              </div>
              <div>
                <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">LICENSE TYPE</p>
                <p className="font-body-md text-[14px] text-on-surface">{facility.license_type.split(' ')[1]}</p>
              </div>
              <div>
                <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">LICENSE STATUS</p>
                <p className="font-code-data text-[13px] text-tertiary font-bold tracking-widest">{facility.license_status}</p>
              </div>
            </div>
          </div>

          {/* Warning Banner */}
          {facility.risk_flags?.high_direct_violations && (
            <div className="bg-secondary/10 border border-secondary/20 rounded-xl p-4 flex items-center gap-3 mb-12 shadow-lg">
              <span className="material-symbols-outlined text-secondary">warning</span>
              <span className="font-label-caps text-[12px] font-bold text-secondary tracking-widest">More than 3 direct violations in the last 18 months</span>
            </div>
          )}

          {/* Inspection Timeline */}
          <div>
            <h2 className="font-headline-md text-[24px] font-bold text-on-surface mb-6">Inspection Timeline</h2>
            <div className="flex flex-col">
              {facility.inspections?.map((insp) => (
                <InspectionAccordion key={insp.id} inspection={insp} onOpenPdf={openPdfViewer} />
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT PANEL - PDF Viewer */}
        {activePdf && (
          <div className="w-1/2 sticky top-[100px] h-[calc(100vh-120px)] transition-all duration-300 rounded-2xl overflow-hidden border border-outline-variant/20 shadow-2xl">
            <PDFViewer
              pdfUrl={activePdf}
              onClose={closePdfViewer}
              inspectionDate={activePdfDate}
              facilityName={facility.name}
            />
          </div>
        )}
      </div>
    </div>
  );
}
