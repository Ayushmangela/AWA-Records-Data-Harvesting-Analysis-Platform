import React, { useState, useEffect, useRef } from 'react';
import { Document, Page } from 'react-pdf';
import { toast } from './Toast';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

export default function PDFViewer({ pdfUrl, highlightPage, highlightText, onClose, inspectionDate, facilityName }) {
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const containerRef = useRef(null);
  const [panelWidth, setPanelWidth] = useState(500); // default fallback

  useEffect(() => {
    // Update container width for PDF rendering
    const updateWidth = () => {
      if (containerRef.current) {
        setPanelWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    if (highlightPage) {
      setCurrentPage(highlightPage);
    }
  }, [highlightPage]);

  // Attempt to highlight text when the page renders
  useEffect(() => {
    if (!highlightText || loading || error) return;
    
    // Slight delay to allow text layer to render
    const timer = setTimeout(() => {
      const textLayer = containerRef.current?.querySelector('.react-pdf__Page__textContent');
      if (!textLayer) return;

      const spans = Array.from(textLayer.querySelectorAll('span'));
      // Basic match (can be improved for exact OCR anomalies)
      const targetText = highlightText.toLowerCase();
      let foundSpan = null;

      for (const span of spans) {
        if (span.textContent.toLowerCase().includes(targetText)) {
          foundSpan = span;
          break;
        }
      }

      if (foundSpan) {
        foundSpan.style.backgroundColor = 'rgba(233, 195, 73, 0.5)'; // secondary with opacity
        foundSpan.style.boxShadow = '0 0 0 4px rgba(233, 195, 73, 0.5)';
        foundSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [highlightText, currentPage, loading, error]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setLoading(false);
    toast.success('PDF loaded successfully');
  };

  const onDocumentLoadError = (err) => {
    console.error("PDF Load Error:", err);
    setError(err);
    setLoading(false);
    toast.error('Could not load PDF');
  };

  const handleDownload = () => {
    toast.info('Downloading official USDA document');
    window.open(pdfUrl, '_blank');
  };

  const originalFilename = pdfUrl.split('/').pop() || 'document.pdf';

  return (
    <div className="flex flex-col h-full bg-surface-container-lowest border border-outline-variant/10 rounded-2xl overflow-hidden shadow-2xl">
      {/* VIEWER HEADER */}
      <div className="bg-surface-container-low h-16 px-6 flex justify-between items-center text-on-surface border-b border-outline-variant/10 shrink-0">
        <div className="flex items-center gap-4 overflow-hidden">
          <span className="material-symbols-outlined text-secondary text-[24px]">description</span>
          <div className="flex flex-col">
            <span className="font-code-data text-[13px] font-bold text-on-surface whitespace-nowrap overflow-hidden text-ellipsis max-w-[250px] tracking-wide">
              {originalFilename}
            </span>
            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest">{facilityName}</span>
          </div>
          {inspectionDate && (
            <span className="bg-surface-variant/30 text-on-surface-variant px-3 py-1 rounded-full font-code-data text-[11px] font-bold tracking-widest whitespace-nowrap border border-outline-variant/10">
              Insp: {inspectionDate}
            </span>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={handleDownload} className="bg-transparent border border-outline-variant/20 hover:border-secondary hover:text-secondary text-on-surface-variant px-4 py-2 rounded-lg cursor-pointer font-label-caps text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-1" title="Download PDF">
            <span className="material-symbols-outlined text-[16px]">download</span> Download
          </button>
          <button onClick={() => window.open(pdfUrl, '_blank')} className="bg-transparent border border-outline-variant/20 hover:border-secondary hover:text-secondary text-on-surface-variant px-4 py-2 rounded-lg cursor-pointer font-label-caps text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-1" title="Open in USDA Site">
            <span className="material-symbols-outlined text-[16px]">open_in_new</span> Open
          </button>
          <button onClick={onClose} className="bg-transparent border-none text-on-surface-variant hover:text-error cursor-pointer p-2 ml-2 transition-colors flex items-center justify-center" title="Close panel">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      </div>

      {/* VIEWER NAVIGATION BAR */}
      <div className="bg-surface-container-highest px-6 py-3 flex justify-between items-center border-b border-outline-variant/10 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            disabled={currentPage <= 1 || loading} 
            onClick={() => setCurrentPage(p => p - 1)}
            className={`bg-surface border border-outline-variant/20 text-on-surface px-3 py-1 rounded-lg transition-all flex items-center justify-center ${currentPage <= 1 ? 'opacity-50 cursor-not-allowed' : 'hover:border-secondary hover:text-secondary cursor-pointer'}`}
          ><span className="material-symbols-outlined text-[18px]">chevron_left</span></button>
          <span className="font-code-data text-[12px] text-on-surface-variant tracking-widest">Page <strong className="text-secondary">{currentPage}</strong> of {numPages || '-'}</span>
          <button 
            disabled={currentPage >= numPages || loading} 
            onClick={() => setCurrentPage(p => p + 1)}
            className={`bg-surface border border-outline-variant/20 text-on-surface px-3 py-1 rounded-lg transition-all flex items-center justify-center ${currentPage >= numPages ? 'opacity-50 cursor-not-allowed' : 'hover:border-secondary hover:text-secondary cursor-pointer'}`}
          ><span className="material-symbols-outlined text-[18px]">chevron_right</span></button>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="bg-surface border border-outline-variant/20 hover:border-secondary hover:text-secondary text-on-surface px-3 py-1 rounded-lg cursor-pointer transition-all flex items-center justify-center"><span className="material-symbols-outlined text-[18px]">remove</span></button>
          <span className="font-code-data text-[12px] text-on-surface-variant min-w-[50px] text-center tracking-widest">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, s + 0.25))} className="bg-surface border border-outline-variant/20 hover:border-secondary hover:text-secondary text-on-surface px-3 py-1 rounded-lg cursor-pointer transition-all flex items-center justify-center"><span className="material-symbols-outlined text-[18px]">add</span></button>
          <button onClick={() => setScale(1.0)} className="bg-surface border border-outline-variant/20 hover:border-secondary hover:text-secondary text-on-surface px-4 py-1 rounded-lg cursor-pointer font-label-caps text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">fit_screen</span> Reset
          </button>
        </div>
      </div>

      {/* VIEWER BODY */}
      <div ref={containerRef} className="flex-1 bg-[#1a1c1e] overflow-y-auto relative flex justify-center py-8 custom-scrollbar">
        {error ? (
          <div className="m-auto bg-surface-container-low border border-outline-variant/10 p-10 rounded-2xl max-w-sm text-center shadow-xl">
            <span className="material-symbols-outlined text-[48px] text-error mb-4 block">error</span>
            <h3 className="m-0 mb-3 text-[18px] font-headline-md text-on-surface">Unable to load PDF</h3>
            <p className="m-0 mb-6 text-[14px] font-body-md text-on-surface-variant leading-relaxed">
              The original document is available at USDA but could not be loaded securely in the viewer.
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={() => window.open(pdfUrl, '_blank')} className="bg-secondary text-on-secondary border-none px-6 py-3 rounded-xl cursor-pointer font-label-caps text-[12px] font-bold uppercase tracking-widest hover:brightness-110 transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]">download</span> Download directly
              </button>
              <button onClick={() => window.open(pdfUrl, '_blank')} className="bg-transparent border border-outline-variant/20 text-on-surface-variant hover:text-secondary hover:border-secondary px-6 py-3 rounded-xl cursor-pointer font-label-caps text-[12px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]">open_in_new</span> Open on USDA site
              </button>
            </div>
            <p className="mt-8 mb-0 text-[10px] font-code-data text-on-surface-variant/50 break-all">
              {pdfUrl}
            </p>
          </div>
        ) : (
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="m-auto text-center flex flex-col items-center">
                <span className="w-8 h-8 border-4 border-outline-variant/20 border-t-secondary rounded-full inline-block animate-spin mb-6"></span>
                <div className="font-label-caps text-[14px] font-bold text-on-surface uppercase tracking-widest mb-2">Loading official USDA document...</div>
                <div className="font-code-data text-[12px] text-secondary tracking-widest uppercase">Fetching from government servers</div>
              </div>
            }
          >
            {numPages && (
              <Page
                pageNumber={currentPage}
                width={(panelWidth - 40) * scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                loading={<div className="bg-white/5 animate-pulse rounded-lg" style={{ width: (panelWidth - 40) * scale, height: '800px' }}></div>}
              />
            )}
          </Document>
        )}
      </div>
    </div>
  );
}
