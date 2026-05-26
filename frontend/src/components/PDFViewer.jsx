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
        foundSpan.style.backgroundColor = 'rgba(253, 224, 71, 0.5)'; // yellow-300 with opacity
        foundSpan.style.boxShadow = '0 0 0 4px rgba(253, 224, 71, 0.5)';
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
      {/* VIEWER HEADER */}
      <div style={{ background: '#1a4731', height: '52px', padding: '0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
          <span style={{ fontSize: '20px' }}>📄</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
              {originalFilename}
            </span>
            <span style={{ fontSize: '11px', color: '#a7f3d0' }}>{facilityName}</span>
          </div>
          {inspectionDate && (
            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '99px', fontSize: '11px', whiteSpace: 'nowrap' }}>
              Insp: {inspectionDate}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleDownload} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }} title="Download PDF">⬇ Download</button>
          <button onClick={() => window.open(pdfUrl, '_blank')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }} title="Open in USDA Site">↗ Open</button>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'white', padding: '4px', cursor: 'pointer', fontSize: '16px', marginLeft: '4px' }} title="Close panel">✕</button>
        </div>
      </div>

      {/* VIEWER NAVIGATION BAR */}
      <div style={{ background: '#f3f4f6', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            disabled={currentPage <= 1 || loading} 
            onClick={() => setCurrentPage(p => p - 1)}
            style={{ background: 'white', border: '1px solid #d1d5db', borderRadius: '4px', padding: '2px 8px', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer' }}
          >←</button>
          <span style={{ fontSize: '13px', color: '#374151' }}>Page {currentPage} of {numPages || '-'}</span>
          <button 
            disabled={currentPage >= numPages || loading} 
            onClick={() => setCurrentPage(p => p + 1)}
            style={{ background: 'white', border: '1px solid #d1d5db', borderRadius: '4px', padding: '2px 8px', cursor: currentPage >= numPages ? 'not-allowed' : 'pointer' }}
          >→</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} style={{ background: 'white', border: '1px solid #d1d5db', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}>-</button>
          <span style={{ fontSize: '13px', color: '#374151', minWidth: '40px', textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, s + 0.25))} style={{ background: 'white', border: '1px solid #d1d5db', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}>+</button>
          <button onClick={() => setScale(1.0)} style={{ background: 'white', border: '1px solid #d1d5db', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '12px' }}>⊞ Reset</button>
        </div>
      </div>

      {/* VIEWER BODY */}
      <div ref={containerRef} style={{ flex: 1, background: '#525659', overflowY: 'auto', position: 'relative', display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
        {error ? (
          <div style={{ margin: 'auto', background: 'white', padding: '32px', borderRadius: '8px', maxWidth: '300px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#111827' }}>Unable to load PDF</h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: '#6b7280' }}>
              The original document is available at USDA but could not be loaded securely in the viewer.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={() => window.open(pdfUrl, '_blank')} style={{ background: '#1a4731', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>⬇ Download directly</button>
              <button onClick={() => window.open(pdfUrl, '_blank')} style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>↗ Open on USDA site</button>
            </div>
            <p style={{ margin: '24px 0 0 0', fontSize: '11px', color: '#9ca3af', wordBreak: 'break-all' }}>
              {pdfUrl}
            </p>
          </div>
        ) : (
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div style={{ margin: 'auto', color: 'white', textAlign: 'center' }}>
                <span className="spinner" style={{ width: "24px", height: "24px", border: "3px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", display: "inline-block", animation: "spin 1s linear infinite", marginBottom: '16px' }}></span>
                <div style={{ fontSize: '14px', fontWeight: '500' }}>Loading official USDA document...</div>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>Fetching from government servers</div>
              </div>
            }
          >
            {numPages && (
              <Page
                pageNumber={currentPage}
                width={(panelWidth - 40) * scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                loading={<div style={{ width: (panelWidth - 40) * scale, height: '800px', background: 'white' }}></div>}
              />
            )}
          </Document>
        )}
      </div>
    </div>
  );
}
